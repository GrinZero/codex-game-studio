import { writeFileSync } from "node:fs";
// Original tetrahedron fixture for actual GLB viewing; not a character or rig.
const vertices = new Float32Array([
  0, 1, 0, -0.8, 0, 0.6, 0.8, 0, 0.6, 0, 1, 0, 0.8, 0, 0.6, 0, 0, -0.8, 0, 1, 0,
  0, 0, -0.8, -0.8, 0, 0.6, -0.8, 0, 0.6, 0, 0, -0.8, 0.8, 0, 0.6,
]);
const normals = new Float32Array(vertices.length);
for (let i = 0; i < vertices.length; i += 9) {
  const a = [
      vertices[i + 3] - vertices[i],
      vertices[i + 4] - vertices[i + 1],
      vertices[i + 5] - vertices[i + 2],
    ],
    b = [
      vertices[i + 6] - vertices[i],
      vertices[i + 7] - vertices[i + 1],
      vertices[i + 8] - vertices[i + 2],
    ];
  const n = [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ],
    l = Math.hypot(...n);
  for (let j = 0; j < 3; j++)
    normals.set(
      n.map((v) => v / l),
      i + j * 3,
    );
}
const bin = Buffer.concat([
  Buffer.from(vertices.buffer),
  Buffer.from(normals.buffer),
]);
const model = {
  asset: { version: "2.0", generator: "Open Game Studio original preview fixture" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: "Preview tetrahedron" }],
  meshes: [
    { primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }] },
  ],
  materials: [
    {
      pbrMetallicRoughness: {
        baseColorFactor: [0.42, 0.65, 0.57, 1],
        metallicFactor: 0.15,
        roughnessFactor: 0.55,
      },
      doubleSided: true,
    },
  ],
  buffers: [{ byteLength: bin.length }],
  bufferViews: [
    {
      buffer: 0,
      byteOffset: 0,
      byteLength: vertices.byteLength,
      target: 34962,
    },
    {
      buffer: 0,
      byteOffset: vertices.byteLength,
      byteLength: normals.byteLength,
      target: 34962,
    },
  ],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: 12,
      type: "VEC3",
      min: [-0.8, 0, -0.8],
      max: [0.8, 1, 0.6],
    },
    { bufferView: 1, componentType: 5126, count: 12, type: "VEC3" },
  ],
};
const raw = Buffer.from(JSON.stringify(model));
const json = Buffer.concat([raw, Buffer.alloc((4 - (raw.length % 4)) % 4, 32)]);
const header = Buffer.alloc(20);
header.write("glTF");
header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + json.length + bin.length, 8);
header.writeUInt32LE(json.length, 12);
header.writeUInt32LE(0x4e4f534a, 16);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(bin.length);
binHeader.writeUInt32LE(0x004e4942, 4);
writeFileSync(
  "samples/preview-mesh.glb",
  Buffer.concat([header, json, binHeader, bin]),
);
