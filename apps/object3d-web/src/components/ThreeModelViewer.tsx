import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type Props = {
  modelUrl?: string;
};

export function ThreeModelViewer({ modelUrl }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) {
      return;
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
    mountEl.innerHTML = "";
    mountEl.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0f172a");

    const camera = new THREE.PerspectiveCamera(60, mountEl.clientWidth / mountEl.clientHeight, 0.1, 1000);
    camera.position.set(2.2, 1.6, 2.6);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0.7, 0);
    controls.update();

    const hemi = new THREE.HemisphereLight("#ffffff", "#334155", 1.15);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight("#ffffff", 1.2);
    dir.position.set(3, 4, 2);
    scene.add(dir);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(7, 64),
      new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.9, metalness: 0.05 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    scene.add(floor);

    const grid = new THREE.GridHelper(8, 16, "#475569", "#334155");
    grid.position.y = 0.001;
    scene.add(grid);

    let frameId = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    let loadedRoot: THREE.Object3D | undefined;
    const loader = new GLTFLoader();
    if (modelUrl) {
      loader.load(
        modelUrl,
        (gltf) => {
          loadedRoot = gltf.scene;
          scene.add(gltf.scene);
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const center = box.getCenter(new THREE.Vector3());
          gltf.scene.position.sub(center);
          const size = box.getSize(new THREE.Vector3()).length() || 1;
          const distance = Math.max(1.8, size * 0.9);
          camera.position.set(distance, distance * 0.8, distance);
          camera.lookAt(0, 0.4, 0);
          controls.target.set(0, 0.35, 0);
          controls.update();
        },
        undefined,
        (error) => {
          // Keep the scene alive; App surface handles user-facing error text.
          console.error("Failed to load model URL", error);
        }
      );
    }

    const onResize = () => {
      if (!mountRef.current) {
        return;
      }
      const { clientWidth, clientHeight } = mountRef.current;
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      if (loadedRoot) {
        scene.remove(loadedRoot);
      }
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(frameId);
      controls.dispose();
      renderer.dispose();
      mountEl.innerHTML = "";
    };
  }, [modelUrl]);

  return <div ref={mountRef} className="viewer-root" />;
}

