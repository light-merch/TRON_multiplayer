import * as THREE from "./three.js/build/three.module.js";

import { OrbitControls } from "./three.js/examples/jsm/controls/OrbitControls.js";
import { OBJLoader } from "./three.js/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "./three.js/examples/jsm/loaders/MTLLoader.js";
import { DDSLoader } from "./three.js/examples/jsm/loaders/DDSLoader.js";
import { GLTFLoader } from "./three.js/examples/jsm/loaders/GLTFLoader.js";

let lastBufferIndex = 0, lastTrail = {}, mainLastTrail = {}, trail_geometry = {}, trail_vertices = {};
let lastX = 0, lastY = 0, lastZ = 0, lastHeading = 0;  // Camera
window.cameraIsNull = true;

const MAX_POINTS = 30000;


export function httpGet(Url) {
    let xmlHttp = new XMLHttpRequest();
    xmlHttp.open("GET", Url, false); // false for synchronous request
    xmlHttp.send(null);
    return JSON.parse(xmlHttp.responseText);
}


export function appendPoint(trail_vertices, vector) {
    trail_vertices[lastBufferIndex++] = vector.x;
    trail_vertices[lastBufferIndex++] = vector.y;
    trail_vertices[lastBufferIndex++] = vector.z;

    return trail_vertices;
}


export function resetTrailData(key) {
    trail_geometry[key] = undefined;
    trail_vertices[key] = undefined;
    lastBufferIndex = 0;
}


export function updateCamera(camera, data, json) {
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

    if (window.cameraIsNull) {
        // Init camera
        window.cameraIsNull = false;

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


export function updateTrail(data, scene, key, json) {
    let trailQuality = 8;

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


export function generateUsername(length) {
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


export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}


export function initStats(Stats) {
    let stats = new Stats();
    stats.setMode(0); // 0: fps, 1: ms

    // Align top-left
    stats.domElement.style.position = "absolute";
    stats.domElement.style.left = "0px";
    stats.domElement.style.top = "0px";
    document.body.appendChild( stats.dom );
    return stats;
}


export function playMusic(camera) {
    // Create an AudioListener and add it to the camera
    const listener = new THREE.AudioListener();
    camera.add( listener );

    // Create a global audio source
    const sound = new THREE.Audio( listener );

    // Load a sound and set it as the Audio object's buffer
    const audioLoader = new THREE.AudioLoader();
    audioLoader.load( 'sounds/tron_legacy.mp3', function( buffer ) {
        sound.setBuffer( buffer );
        sound.setLoop( true );
        sound.setVolume( 0.5 );
        sound.play();
    });
}


// This function is needed, since animationAction.crossFadeTo() disables its start action and sets
// the start action's timeScale to ((start animation's duration) / (end animation's duration))
export function setWeight( action, weight ) {
    action.enabled = true;
    action.setEffectiveTimeScale( 1 );
    action.setEffectiveWeight( weight );
}


// Called by the render loop
export function updateWeightSliders(animating) {
    animating.settings[ 'modify idle weight' ] = animating.idleWeight;
    animating.settings[ 'modify walk weight' ] = animating.walkWeight;
    animating.settings[ 'modify run weight' ] = animating.runWeight;

    return animating
}


// Called by the render loop
export function updateCrossFadeControls(animating) {
    if (animating.idleWeight === 1 && animating.walkWeight === 0 && animating.runWeight === 0) {
        animating.crossFadeControls[ 0 ].disable();
        animating.crossFadeControls[ 1 ].enable();
        animating.crossFadeControls[ 2 ].disable();
        animating.crossFadeControls[ 3 ].disable();
    }

    if (animating.idleWeight === 0 && animating.walkWeight === 1 && animating.runWeight === 0) {
        animating.crossFadeControls[ 0 ].enable();
        animating.crossFadeControls[ 1 ].disable();
        animating.crossFadeControls[ 2 ].enable();
        animating.crossFadeControls[ 3 ].disable();
    }

    if (animating.idleWeight === 0 && animating.walkWeight === 0 && animating.runWeight === 1) {
        animating.crossFadeControls[ 0 ].disable();
        animating.crossFadeControls[ 1 ].disable();
        animating.crossFadeControls[ 2 ].disable();
        animating.crossFadeControls[ 3 ].enable();
    }
}


function activateAllActions(animating) {
    console.log(animating.settings);
    setWeight( animating.idleAction, animating.settings[ 'modify idle weight' ] );
    setWeight( animating.walkAction, animating.settings[ 'modify walk weight' ] );
    setWeight( animating.runAction, animating.settings[ 'modify run weight' ] );

    animating.actions.forEach( function ( action ) {
        action.play();
    } );

    return animating
}


function deactivateAllActions(animating) {
    animating.actions.forEach( function ( action ) {
        action.stop();
    });

    return animating;
}


function pauseContinue(animating) {
    if (animating.singleStepMode) {
        animating.singleStepMode = false;
        unPauseAllActions();
    } else {
        if (animating.idleAction.paused) {
            unPauseAllActions();
        } else {
            pauseAllActions();
        }
    }

    return animating;
}


function unPauseAllActions(animating) {
    animating.actions.forEach( function ( action ) {
        action.paused = false;
    });

    return animating;
}

function toSingleStepMode(animating) {
    unPauseAllActions();

    animating.singleStepMode = true;
    animating.sizeOfNextStep = settings[ 'modify step size' ];

    return animating;
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
export function init(animating) {
    // Init HTML
    let title_screen = document.getElementById("title_screen");
    title_screen.remove(); // Removes the div with the 'title_screen' id

    // Add booster icons & counter
    document.getElementsByClassName("score")[0].innerHTML =
        '<div style="float: left; margin-right: 10px;">Score </div>\n' +
        '<div style="float: right;" id="scorenumber"></div>\n';

    document.getElementsByClassName("boosters")[0].innerHTML =
        '<div id="1" class="grey"></div>\n' +
        '<div id="2" class="grey"></div>\n' +
        '<div id="3" class="grey"></div>\n' +
        '<div id="4" class="grey"></div>\n' +
        '<div id="5" class="grey"></div>\n';


    // Proceed with Three.js
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


    // Animation settings
    animating.clock = new THREE.Clock();
    animating.settings = {
        'show model': true,
        'show skeleton': false,
        'deactivate all': deactivateAllActions,
        'activate all': activateAllActions,
        'pause/continue': pauseContinue,
        'make single step': toSingleStepMode,
        'modify step size': 0.05,
        'from walk to idle': function () {

            prepareCrossFade( walkAction, idleAction, 1.0 );

        },
        'from idle to walk': function () {

            prepareCrossFade( idleAction, walkAction, 0.5 );

        },
        'from walk to run': function () {

            prepareCrossFade( walkAction, runAction, 2.5 );

        },
        'from run to walk': function () {

            prepareCrossFade( runAction, walkAction, 5.0 );

        },
        'use default duration': true,
        'set custom duration': 3.5,
        'modify idle weight': 0.0,
        'modify walk weight': 1.0,
        'modify run weight': 0.0,
        'modify time scale': 1.0
    };

    // Load animations
    const loader = new GLTFLoader();
    loader.load( 'three.js/examples/models/gltf/Soldier.glb', function (gltf) {
        window.model = gltf.scene;
        scene.add(model);

        window.model.traverse(function (object) {
            if (object.isMesh) object.castShadow = true;
        });

        animating.skeleton = new THREE.SkeletonHelper( window.model );
        animating.skeleton.visible = false;
        scene.add(animating.skeleton);


        const animations = gltf.animations;

        animating.mixer = new THREE.AnimationMixer( window.model );

        animating.idleAction = animating.mixer.clipAction( animations[ 0 ] );
        animating.walkAction = animating.mixer.clipAction( animations[ 3 ] );
        animating.runAction = animating.mixer.clipAction( animations[ 1 ] );

        animating.actions = [ animating.idleAction, animating.walkAction, animating.runAction ];


        animating = activateAllActions(animating);
    });


    // light
    let ambientLight = new THREE.AmbientLight(0xFFFFFF, 8);
    scene.add(ambientLight);

    return [scene, renderer, camera, controls, animating];
}
