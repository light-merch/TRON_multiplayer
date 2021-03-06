import * as THREE from "./three.module.js";

import { OrbitControls } from "./OrbitControls.js";
import { OBJLoader } from "./OBJLoader.js";
import { MTLLoader } from "./MTLLoader.js";
import { DDSLoader } from "./DDSLoader.js";


function httpGet(Url) {
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open("GET", Url, false); // false for synchronous request
    xmlHttp.send(null);
    return JSON.parse(xmlHttp.responseText);
}


function generateUsername(length) {
    for (const name of ["flynn", "tron", "clu", "sam", "quorra", "rinzler"]) {
        if (httpGet("/check/" + name)["status"] === "false") {
            return name;
        }
    }

    let result = "";
    while (httpGet("/check/" + result)["status"] !== "false") {
        let characters = "abcdefghijklmnopqrstuvwxyz";
        for (let i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
    }
    return result;
}


function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}


function initStats(Stats) {
    var stats = new Stats();
    stats.setMode(0); // 0: fps, 1: ms

    // Align top-left
    stats.domElement.style.position = "absolute";
    stats.domElement.style.left = "0px";
    stats.domElement.style.top = "0px";
    document.body.appendChild( stats.dom );
    return stats;
}


function init() {
    let scene = new THREE.Scene();
    let camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000);

    let renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setSize(window.innerWidth, window.innerHeight);

    document.body.appendChild(renderer.domElement);
    let controls = new OrbitControls(camera, renderer.domElement);
    controls.enableKeys = false;

    window.addEventListener("resize", function () {
        let width = window.innerWidth;
        let height = window.innerHeight;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    });

    const onProgress = function ( xhr ) {
        if ( xhr.lengthComputable ) {
            const percentComplete = xhr.loaded / xhr.total * 100;
            // TODO: create a loading screen
            // console.log( Math.round(percentComplete, 2) + "% downloaded" );
        }
    };
    const onError = function () { };

    const manager = new THREE.LoadingManager();
    manager.addHandler(/\.dds$/i, new DDSLoader());

    new MTLLoader(manager)
        .setPath("models/")
        .load( "bike.mtl", function (materials) {

            materials.preload();

            new OBJLoader(manager)
                .setMaterials( materials )
                .setPath("models/")
                .load( "bike.obj", function (object) {
                    let pivotPoint = new THREE.Object3D();
                    pivotPoint.add(object);
                    object.position.set(0, -0.3, 2);
                    window.template = pivotPoint;
                    window.bike = window.template.clone();
                    scene.add(window.bike);

                }, onProgress, onError );

        });

    new MTLLoader(manager)
        .setPath("models/")
        .load( "arena7.mtl", function (materials) {

            materials.preload();

            new OBJLoader(manager)
                .setMaterials( materials )
                .setPath("models/")
                .load( "arena7.obj", function (object) {
                    window.arena = object;
                    scene.add(window.arena);
                    window.arena.scale.set(40, 40, 40);
                    window.arena.position.set(20, 0, -20);

                }, onProgress, onError );

        } );

    // light
    let ambientLight = new THREE.AmbientLight(0xFFFFFF, 8);
    scene.add(ambientLight);

    return [scene, renderer, camera, controls];
}


export { initStats, sleep, generateUsername, init };
