import * as THREE from "./three.module.js";

import { OrbitControls } from "./OrbitControls.js";
import { OBJLoader } from "./OBJLoader.js";
import { MTLLoader } from "./MTLLoader.js";
import { DDSLoader } from "./DDSLoader.js";

let lastBufferIndex = 0, lastTrail = {}, mainLastTrail = {}, trail_geometry = {}, trail_vertices = {};
let lastX = 0, lastY = 0, lastZ = 0, lastHeading = 0, cameraIsNull = true;  // Camera

const MAX_POINTS = 30000;

function httpGet(Url) {
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open("GET", Url, false); // false for synchronous request
    xmlHttp.send(null);
    return JSON.parse(xmlHttp.responseText);
}


function appendPoint(trail_vertices, vector) {
    trail_vertices[lastBufferIndex++] = vector.x;
    trail_vertices[lastBufferIndex++] = vector.y;
    trail_vertices[lastBufferIndex++] = vector.z;

    return trail_vertices;
}


function resetTrailData(key) {
    trail_geometry[key] = undefined;
    trail_vertices[key] = undefined;
    lastBufferIndex = 0;
}

function updateCamera(camera, data, json) {
    let currentPlayer = {};
    if (!json) {
        currentPlayer["heading"] = data.rotation.y;
        currentPlayer["rotation"] = -data.rotation.z;
        currentPlayer["x"] = data.position.x;
        currentPlayer["y"] = data.position.y;
        currentPlayer["z"] = data.position.z;
    } else {
        currentPlayer = data;
    }

    if (cameraIsNull) {
        // Init camera
        cameraIsNull = false;

        camera.position.y = 10;
        camera.position.x = currentPlayer["x"] + 15 * Math.sin(currentPlayer["heading"] - Math.PI);
        camera.position.z = currentPlayer["z"] + 15 * Math.cos(currentPlayer["heading"] - Math.PI);

        lastX = currentPlayer["x"];
        lastY = currentPlayer["y"];
        lastZ = currentPlayer["z"];
        lastHeading = currentPlayer["heading"];

        if (json) camera.lookAt(window.bike);
    } else {
        camera.position.x += currentPlayer["x"] - lastX;
        camera.position.y += currentPlayer["y"] - lastY;
        camera.position.z += currentPlayer["z"] - lastZ;

        let angle = lastHeading - currentPlayer["heading"];
        if (angle >= 360) {
            lastHeading += Math.trunc(angle / 360) * 360;
        }
        if (Math.abs(angle) >= 0.0001) {
            if (angle > 0) {
                angle = Math.min(angle, 0.05);
            } else {
                angle = Math.max(angle, -0.05);
            }
            let x = [camera.position.x, window.bike.position.x];
            let y = [camera.position.z, window.bike.position.z];
            camera.position.x = window.bike.position.x + (x[0] - x[1]) * Math.cos(angle) + (y[0] - y[1]) * (-Math.sin(angle));
            camera.position.z = window.bike.position.z + (x[0] - x[1]) * Math.sin(angle) + (y[0] - y[1]) * Math.cos(angle);

            lastHeading -= angle;
        }
    }

    lastX = currentPlayer["x"];
    lastY = currentPlayer["y"];
    lastZ = currentPlayer["z"];

    return camera;
}


function updateTrail(data, scene, key, json) {
    let trailQuality = 16;

    let allPlayers = {};
    if (!json) {
        allPlayers["heading"] = data[key].rotation.y;
        allPlayers["rotation"] = -data[key].rotation.z;
        allPlayers["x"] = data[key].position.x;
        allPlayers["y"] = data[key].position.y;
        allPlayers["z"] = data[key].position.z;
    } else {
        allPlayers = data[key];
    }

    if (trail_geometry[key] === undefined) {
        // Init trail for a new player
        trail_geometry[key] = new THREE.BufferGeometry();
        trail_vertices[key] = new Float32Array(MAX_POINTS * 3);
        lastTrail[key] = [new THREE.Vector3(allPlayers["x"], allPlayers["y"], allPlayers["z"]),
            new THREE.Vector3(allPlayers["x"], allPlayers["y"] + 1, allPlayers["z"])];
        mainLastTrail[key] = Object.assign({}, lastTrail[key]);


        // Trail init
        trail_geometry[key].setAttribute( "position", new THREE.BufferAttribute( trail_vertices[key], 3 ) );
        let trail_material = new THREE.MeshBasicMaterial( { color: 0x0fbef2, wireframe: false } );
        let mesh = new THREE.Mesh( trail_geometry[key], trail_material );
        mesh.name = "trail";
        scene.add(mesh);
        mesh.traverse( function( node ) {
            if( node.material ) {
                node.material.side = THREE.DoubleSide;
            }
        });
        mesh.frustumCulled = false;
    } else {
        let dx = Math.abs(mainLastTrail[key][0].x - allPlayers["x"]);
        let dz = Math.abs(mainLastTrail[key][0].z - allPlayers["z"]);

        if (dx * dx + dz * dz <= trailQuality && lastBufferIndex > 0) {
            // Update just last poly of the trail
            lastBufferIndex = Math.max(lastBufferIndex - 18, 0);
        } else {
            if (lastBufferIndex !== 0) {
                mainLastTrail[key] = Object.assign({}, lastTrail[key]);  // Copy that way, that when
                // lastTrail is changed, mainLastTrail isn't
            }
        }

        trail_geometry[key].setAttribute("position", new THREE.BufferAttribute(trail_vertices[key], 3));

        // Update trail by creating new poly
        trail_vertices[key] = appendPoint(trail_vertices[key], mainLastTrail[key][0]);
        trail_vertices[key] = appendPoint(trail_vertices[key], mainLastTrail[key][1]);
        trail_vertices[key] = appendPoint(trail_vertices[key], new THREE.Vector3(allPlayers["x"], allPlayers["y"], allPlayers["z"]));

        let a = (Math.PI / 2) - (allPlayers["heading"]);
        let top_bike = new THREE.Vector3(allPlayers["x"] + Math.sin(allPlayers["rotation"] * Math.sin(a)),
            allPlayers["y"] + Math.cos(allPlayers["rotation"]), // Height
            allPlayers["z"] - Math.sin(allPlayers["rotation"]) * Math.cos(a))

        trail_vertices[key] = appendPoint(trail_vertices[key], top_bike);
        trail_vertices[key] = appendPoint(trail_vertices[key], allPlayers);
        trail_vertices[key] = appendPoint(trail_vertices[key], mainLastTrail[key][1]);

        lastTrail[key][1] = top_bike;
        lastTrail[key][0] = new THREE.Vector3(allPlayers["x"], allPlayers["y"], allPlayers["z"]);
    }

    return scene;
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
    let camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 5000);

    let renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setSize(window.innerWidth, window.innerHeight);

    document.body.appendChild(renderer.domElement);
    let controls = new OrbitControls(camera, renderer.domElement);
    controls.enableKeys = false;
    controls.enableZoom = false;

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
            console.log( Math.round(percentComplete) + "% downloaded" );
        }
    };
    const onError = function () { };

    const manager = new THREE.LoadingManager();
    manager.addHandler(/\.dds$/i, new DDSLoader());

    new MTLLoader(manager)
        .setPath("models/")
        .load( "bike2.mtl", function (materials) {

            materials.preload();

            new OBJLoader(manager)
                .setMaterials( materials )
                .setPath("models/")
                .load( "bike2.obj", function (object) {
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


export { initStats, sleep, generateUsername, init, updateTrail, resetTrailData, updateCamera };
