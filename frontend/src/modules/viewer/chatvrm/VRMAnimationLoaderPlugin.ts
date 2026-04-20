/**
 * GLTFLoader plugin that parses VRMC_vrm_animation extensions
 * and produces VRMAnimation instances.
 *
 * Ported from pixiv/ChatVRM.
 * Original: src/lib/VRMAnimation/VRMAnimationLoaderPlugin.ts
 *
 * Adapted for three 0.183 / @pixiv/three-vrm 3.5.x.
 * The @gltf-transform/core dependency has been replaced with inline
 * glTF schema types.
 */

import * as THREE from "three";
import type {
  GLTF,
  GLTFLoaderPlugin,
  GLTFParser,
} from "three/addons/loaders/GLTFLoader.js";
import type { VRMCVRMAnimation } from "./VRMCVRMAnimation.js";
import { VRMHumanBoneName, VRMHumanBoneParentMap } from "@pixiv/three-vrm";
import { VRMAnimation } from "./VRMAnimation.js";
import { arrayChunk } from "./arrayChunk.js";

// ---------------------------------------------------------------------------
// Inline glTF JSON schema types (replaces @gltf-transform/core import)
// ---------------------------------------------------------------------------

interface GLTFSchemaAnimationChannelTarget {
  node?: number;
  path: string;
}

interface GLTFSchemaAnimationChannel {
  target: GLTFSchemaAnimationChannelTarget;
}

interface GLTFSchemaAnimation {
  channels: GLTFSchemaAnimationChannel[];
}

interface GLTFSchemaRoot {
  extensionsUsed?: string[];
  extensions?: Record<string, unknown>;
  animations?: GLTFSchemaAnimation[];
}

// ---------------------------------------------------------------------------

const MAT4_IDENTITY = new THREE.Matrix4();

const _v3A = new THREE.Vector3();
const _quatA = new THREE.Quaternion();
const _quatB = new THREE.Quaternion();
const _quatC = new THREE.Quaternion();

interface VRMAnimationLoaderPluginNodeMap {
  humanoidIndexToName: Map<number, VRMHumanBoneName>;
  expressionsIndexToName: Map<number, string>;
  lookAtIndex: number | null;
}

type VRMAnimationLoaderPluginWorldMatrixMap = Map<
  VRMHumanBoneName | "hipsParent",
  THREE.Matrix4
>;

export class VRMAnimationLoaderPlugin implements GLTFLoaderPlugin {
  public readonly parser: GLTFParser;

  public constructor(parser: GLTFParser) {
    this.parser = parser;
  }

  public get name(): string {
    return "VRMC_vrm_animation";
  }

  public async afterRoot(gltf: GLTF): Promise<void> {
    const defGltf = gltf.parser.json as GLTFSchemaRoot;
    const defExtensionsUsed = defGltf.extensionsUsed;

    if (
      defExtensionsUsed == null ||
      defExtensionsUsed.indexOf(this.name) === -1
    ) {
      return;
    }

    const defExtension = defGltf.extensions?.[this.name] as
      | VRMCVRMAnimation
      | undefined;

    if (defExtension == null) {
      return;
    }

    const nodeMap = this._createNodeMap(defExtension);
    const worldMatrixMap = await this._createBoneWorldMatrixMap(
      gltf,
      defExtension,
    );

    const hipsNode = defExtension.humanoid.humanBones["hips"]!.node;
    const hips = (await gltf.parser.getDependency(
      "node",
      hipsNode,
    )) as THREE.Object3D;
    const restHipsPosition = hips.getWorldPosition(new THREE.Vector3());

    const clips = gltf.animations;
    const animations: VRMAnimation[] = clips.map((clip, iAnimation) => {
      const defAnimation = defGltf.animations![iAnimation];

      const animation = this._parseAnimation(
        clip,
        defAnimation,
        nodeMap,
        worldMatrixMap,
      );
      animation.restHipsPosition = restHipsPosition;

      return animation;
    });

    gltf.userData.vrmAnimations = animations;
  }

  private _createNodeMap(
    defExtension: VRMCVRMAnimation,
  ): VRMAnimationLoaderPluginNodeMap {
    const humanoidIndexToName = new Map<number, VRMHumanBoneName>();
    const expressionsIndexToName = new Map<number, string>();

    // humanoid
    const humanBones = defExtension.humanoid?.humanBones;
    if (humanBones) {
      for (const [name, bone] of Object.entries(humanBones)) {
        if (bone) {
          humanoidIndexToName.set(bone.node, name as VRMHumanBoneName);
        }
      }
    }

    // expressions
    const preset = defExtension.expressions?.preset;
    if (preset) {
      for (const [name, expression] of Object.entries(preset)) {
        if (expression) {
          expressionsIndexToName.set(expression.node, name);
        }
      }
    }

    const custom = defExtension.expressions?.custom;
    if (custom) {
      for (const [name, expression] of Object.entries(custom)) {
        if (expression) {
          expressionsIndexToName.set(expression.node, name);
        }
      }
    }

    // lookAt
    const lookAtIndex = defExtension.lookAt?.node ?? null;

    return { humanoidIndexToName, expressionsIndexToName, lookAtIndex };
  }

  private async _createBoneWorldMatrixMap(
    gltf: GLTF,
    defExtension: VRMCVRMAnimation,
  ): Promise<VRMAnimationLoaderPluginWorldMatrixMap> {
    gltf.scene.updateWorldMatrix(false, true);

    const threeNodes = (await gltf.parser.getDependencies(
      "node",
    )) as THREE.Object3D[];

    const worldMatrixMap: VRMAnimationLoaderPluginWorldMatrixMap = new Map();

    for (const [boneName, boneRef] of Object.entries(
      defExtension.humanoid.humanBones,
    )) {
      if (!boneRef) continue;
      const threeNode = threeNodes[boneRef.node];
      worldMatrixMap.set(boneName as VRMHumanBoneName, threeNode.matrixWorld);

      if (boneName === "hips") {
        worldMatrixMap.set(
          "hipsParent",
          threeNode.parent?.matrixWorld ?? MAT4_IDENTITY,
        );
      }
    }

    return worldMatrixMap;
  }

  private _parseAnimation(
    animationClip: THREE.AnimationClip,
    defAnimation: GLTFSchemaAnimation,
    nodeMap: VRMAnimationLoaderPluginNodeMap,
    worldMatrixMap: VRMAnimationLoaderPluginWorldMatrixMap,
  ): VRMAnimation {
    const tracks = animationClip.tracks;
    const defChannels = defAnimation.channels;

    const result = new VRMAnimation();
    result.duration = animationClip.duration;

    defChannels.forEach((channel, iChannel) => {
      const { node, path } = channel.target;
      const origTrack = tracks[iChannel];

      if (node == null) {
        return;
      }

      // humanoid
      const boneName = nodeMap.humanoidIndexToName.get(node);
      if (boneName != null) {
        let parentBoneName: VRMHumanBoneName | null =
          VRMHumanBoneParentMap[boneName];
        while (
          parentBoneName != null &&
          worldMatrixMap.get(parentBoneName) == null
        ) {
          parentBoneName = VRMHumanBoneParentMap[parentBoneName];
        }
        const resolvedParent: VRMHumanBoneName | "hipsParent" =
          parentBoneName ?? "hipsParent";

        if (path === "translation") {
          const hipsParentWorldMatrix = worldMatrixMap.get("hipsParent")!;

          const trackValues = arrayChunk(
            Array.from(origTrack.values),
            3,
          ).flatMap((v) =>
            _v3A.fromArray(v).applyMatrix4(hipsParentWorldMatrix).toArray(),
          );

          const track = origTrack.clone();
          track.values = new Float32Array(trackValues);

          result.humanoidTracks.translation.set(boneName, track as THREE.VectorKeyframeTrack);
        } else if (path === "rotation") {
          const worldMatrix = worldMatrixMap.get(boneName)!;
          const parentWorldMatrix = worldMatrixMap.get(resolvedParent)!;

          _quatA.setFromRotationMatrix(worldMatrix).normalize().invert();
          _quatB.setFromRotationMatrix(parentWorldMatrix).normalize();

          const trackValues = arrayChunk(
            Array.from(origTrack.values),
            4,
          ).flatMap((q) =>
            _quatC.fromArray(q).premultiply(_quatB).multiply(_quatA).toArray(),
          );

          const track = origTrack.clone();
          track.values = new Float32Array(trackValues);

          result.humanoidTracks.rotation.set(boneName, track as THREE.VectorKeyframeTrack);
        } else {
          throw new Error(`Invalid path "${path}"`);
        }
        return;
      }

      // expressions
      const expressionName = nodeMap.expressionsIndexToName.get(node);
      if (expressionName != null) {
        if (path === "translation") {
          const times = origTrack.times;
          const values = new Float32Array(origTrack.values.length / 3);
          for (let i = 0; i < values.length; i++) {
            values[i] = origTrack.values[3 * i];
          }

          const newTrack = new THREE.NumberKeyframeTrack(
            `${expressionName}.weight`,
            // Three.js accepts TypedArray at runtime, but types declare number[]
            times as unknown as number[],
            values as unknown as number[],
          );
          result.expressionTracks.set(expressionName, newTrack);
        } else {
          throw new Error(`Invalid path "${path}"`);
        }
        return;
      }

      // lookAt
      if (node === nodeMap.lookAtIndex) {
        if (path === "rotation") {
          result.lookAtTrack = origTrack as THREE.QuaternionKeyframeTrack;
        } else {
          throw new Error(`Invalid path "${path}"`);
        }
      }
    });

    return result;
  }
}
