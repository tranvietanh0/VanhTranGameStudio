/**
 * Dev-time asset build (NOT part of the app bundle, not type-checked by the web tsconfig).
 *
 * Packs the CC0 Kenney models the office uses into two small meshopt-compressed GLBs:
 *   - office-kit.glb   furniture, one root node per model (named by key), re-centred on x/z, floor at y=0
 *   - characters.glb   chibi character variants (one root node per variant, shared rig node names)
 *                      plus ONE copy of the animation clips the office uses
 *
 * Inputs are the unzipped Kenney packs (see public/assets/CREDITS.md for sources):
 *   <src>/furn  = "Furniture Kit (2.0)"   (Models/GLTF format/*.glb)
 *   <src>/mini  = "Mini Characters (1.0)" (Models/GLB format/*.glb)
 *
 * Run from a scratch dir that has the libraries installed (they are intentionally not app deps):
 *   bun add @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer
 *   bun build-assets.ts <src> <repo>/apps/web/public/assets
 */
import { Document, NodeIO, type Node } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, getBounds, meshopt, mergeDocuments, prune, unpartition, weld } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";

const [src, out] = process.argv.slice(2);
if (!src || !out) throw new Error("usage: bun build-assets.ts <srcDir> <outDir>");

/** key in the app → Kenney Furniture Kit file name. */
const FURNITURE: Record<string, string> = {
  desk: "desk", bossDesk: "deskCorner", chairDesk: "chairDesk", monitor: "computerScreen",
  keyboard: "computerKeyboard", laptop: "laptop", deskLamp: "lampRoundTable", floorLamp: "lampSquareFloor",
  plantTall: "pottedPlant", plantSmall1: "plantSmall1", plantSmall2: "plantSmall2", plantSmall3: "plantSmall3",
  sofa: "loungeSofa", sofaCorner: "loungeSofaCorner", armchair: "loungeChair", designSofa: "loungeDesignSofa",
  designChair: "loungeDesignChair", coffeeTable: "tableCoffee", rugRect: "rugRectangle", rugRound: "rugRound",
  rugRounded: "rugRounded", doormat: "rugDoormat", bookcase: "bookcaseOpen", bookcaseWide: "bookcaseClosedWide",
  books: "books", coffeeMachine: "kitchenCoffeeMachine", cabinet: "kitchenCabinet", fridge: "kitchenFridgeSmall",
  sideTable: "sideTable", coatRack: "coatRackStanding", trashcan: "trashcan", doorway: "doorwayOpen",
  speaker: "speakerSmall", radio: "radio", tableRound: "tableRound", stool: "stoolBar",
};

/** Character variant key → Kenney Mini Characters file. The first one also donates the clips. */
const CHARACTERS = [
  "male-d", "female-d", "male-a", "female-f", "female-b", "male-f", "female-c", "male-b", "male-e",
] as const;
const CLIPS = new Set(["idle", "walk", "sit", "holding-both", "interact-right", "emote-yes"]);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });

/** Moves every root node of `doc`'s scene under one new root named `key`, centred on x/z, floor at y=0. */
function wrapScene(doc: Document, key: string, recentre: boolean): void {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  if (!scene) throw new Error(`${key}: no scene`);
  const b = getBounds(scene);
  const root: Node = doc.createNode(key);
  if (recentre) root.setTranslation([-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2]);
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    root.addChild(child);
  }
  scene.addChild(root);
}

async function pack(files: Array<{ key: string; path: string }>, recentre: boolean, keepClipsFromFirst: boolean): Promise<Document> {
  let target: Document | null = null;
  for (const [i, f] of files.entries()) {
    const doc = await io.read(f.path);
    wrapScene(doc, f.key, recentre);
    for (const anim of doc.getRoot().listAnimations()) {
      if (keepClipsFromFirst && i === 0 && CLIPS.has(anim.getName())) continue;
      // Dispose the sampler accessors too; prune() would keep them alive through detached samplers.
      for (const sampler of anim.listSamplers()) {
        sampler.getInput()?.dispose();
        sampler.getOutput()?.dispose();
        sampler.dispose();
      }
      for (const channel of anim.listChannels()) channel.dispose();
      anim.dispose();
    }
    if (!target) {
      target = doc;
      continue;
    }
    mergeDocuments(target, doc);
  }
  if (!target) throw new Error("nothing to pack");
  const root = target.getRoot();
  const [mainScene, ...extra] = root.listScenes();
  if (!mainScene) throw new Error("no scene after merge");
  for (const s of extra) {
    for (const child of s.listChildren()) {
      s.removeChild(child);
      mainScene.addChild(child);
    }
    s.dispose();
  }
  root.setDefaultScene(mainScene);
  // Attributes the office never reads.
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const sem of ["TANGENT", "TEXCOORD_1"]) prim.setAttribute(sem, null);
    }
  }
  await target.transform(unpartition(), dedup(), prune(), weld(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  return target;
}

const furn = Object.entries(FURNITURE).map(([key, file]) => ({ key, path: `${src}/furn/Models/GLTF format/${file}.glb` }));
const chars = CHARACTERS.map((key) => ({ key, path: `${src}/mini/Models/GLB format/character-${key}.glb` }));

await io.write(`${out}/office-kit.glb`, await pack(furn, true, false));
await io.write(`${out}/characters.glb`, await pack(chars, false, true));
console.log("wrote", `${out}/office-kit.glb`, `${out}/characters.glb`);
