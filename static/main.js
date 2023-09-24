import * as THREE from "three";

import { TextGeometry } from "./three.js/examples/jsm/geometries/TextGeometry.js";
import { FontLoader } from "./three.js/examples/jsm/loaders/FontLoader.js";

// Object loaders
import { OrbitControls } from "./three.js/examples/jsm/controls/OrbitControls.js";
import { OBJLoader } from "./three.js/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "./three.js/examples/jsm/loaders/MTLLoader.js";
import { DDSLoader } from "./three.js/examples/jsm/loaders/DDSLoader.js";
import { GLTFLoader } from "./three.js/examples/jsm/loaders/GLTFLoader.js";

let socket = io("http://" + window.location.hostname + ":" + window.location.port);  // Init socket


let lastBufferIndex = 0, lastTrail = {}, mainLastTrail = {}, trail_geometry = {}, trail_vertices = {};
let lastX = 0, lastY = 0, lastZ = 0, lastHeading = 0;  // this.camera

let GameLoop = undefined;
window.grid = null;
const MAX_POINTS = 30000;


function isTouchDevice() {
    return (('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        (navigator.msMaxTouchPoints > 0));
}


function httpGet(Url) {
    let xmlHttp = new XMLHttpRequest();
    xmlHttp.open("GET", Url, false); // false for synchronous request
    xmlHttp.send(null);
    return JSON.parse(xmlHttp.responseText);
}


function makeStruct(names) {
    names = names.split(' ');
    let count = names.length;
    function constructor() {
        for (let i = 0; i < count; i++) {
            this[names[i]] = arguments[i];
        }
    }
    return constructor;
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


class Game {
    constructor() { }

    init() {
        this.allVehicles = undefined; this.vehicles = {}; this.characters = {}; this.last_time = Date.now(); this.PlayerData = {};
        this.boosters = [];

        window.names = {};

        // Animations
        this.idleAction = undefined; this.walkAction = undefined; this.runAction = undefined;
        this.idleWeight = undefined; this.walkWeight = undefined; this.runWeight = undefined;
        this.actions = undefined; this.settings = undefined;

        this.skeleton = undefined; this.mixer = undefined; this.clock = undefined;

        this.crossFadeControls = [];

        this.singleStepMode = false;
        this.sizeOfNextStep = 0;

        this.initStats();


        this.FizzyText = function() {
            this.username = generateUsername(6);
            this.error = "";

            this.submitName = function () {
                this.username = this.username.toLowerCase();
                let res = httpGet("/check/" + this.username);
                if (res["status"] === "true" || this.username.length >= 30 || res["error"] === "true") {
                    if (this.error === "") {
                        this.error = "This username is already taken or contains non-English letters"
                        let e = gui.add(this.fizzyText, "error").name("Error");
                        e.domElement.style.pointerEvents = "none";
                    }
                } else {
                    window.grid.init_threejs();

                    if (isTouchDevice()) {
                        document.getElementsByClassName("controls")[0].innerHTML =
                            '<div class="buttonleft">\n' +
                            '                <img src="icons/left1.svg" alt="Left" width="100%" height="100%">\n' +
                            '            </div>\n' +
                            '            <div class="buttonright\">\n' +
                            '                <img src="icons/right1.svg" alt="Right" width="100%" height="100%">\n' +
                            '            </div>';

                        document.getElementsByClassName("boost")[0].innerHTML =
                            '<div class="buttonboost">\n' +
                            '                <img src="icons/boost1.svg" alt="Boost" width="100%" height="100%">\n' +
                            '            </div>\n';

                        let left = document.getElementsByClassName("buttonleft")[0];
                        let right = document.getElementsByClassName("buttonright")[0];
                        let boost = document.getElementsByClassName("buttonboost")[0];

                        // Mouse events (for mobile)
                        left.addEventListener("touchstart", process_touchstart_l, false);
                        left.addEventListener("touchend", process_touchend_l, false);

                        right.addEventListener("touchstart", process_touchstart_r, false);
                        right.addEventListener("touchend", process_touchend_r, false);

                        boost.addEventListener("touchstart", process_touchstart_b, false);

                        // touchstart handler
                        function process_touchstart_l(ev) {
                            ev.preventDefault();
                            socket.emit("keydown", {"user": window.grid.fizzyText.username, "key": 65});
                            window.grid.PlayerData[window.username].max_turn_angle = 0.7;
                        }

                        function process_touchend_l(ev) {
                            ev.preventDefault();
                            socket.emit("keyup", {"user": window.grid.fizzyText.username, "key": 65});
                            window.grid.PlayerData[window.username].max_turn_angle = -0.0001;
                        }

                        function process_touchstart_r(ev) {
                            ev.preventDefault();
                            socket.emit("keydown", {"user": window.grid.fizzyText.username, "key": 68});
                            window.grid.PlayerData[window.username].max_turn_angle = -0.7;
                        }

                        function process_touchend_r(ev) {
                            ev.preventDefault();
                            socket.emit("keyup", {"user": window.grid.fizzyText.username, "key": 68});
                            window.grid.PlayerData[window.username].max_turn_angle = 0.0001;
                        }

                        function process_touchstart_b(ev) {
                            ev.preventDefault();
                            socket.emit("keydown", {"user": window.grid.fizzyText.username, "key": 16});
                        }
                    }
                }
            };
        };

        // Init HTML
        let title_screen = document.getElementById("title_screen");
        title_screen.remove(); // Removes the div with the 'title_screen' id
    }


    init_threejs() {
        window.state = "game";

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

        let Item = makeStruct("player_name speed heading booster score" +
            " dead trail_size rotation boost_time toggle_controls_rotation max_turn_angle last_collision_check");

        window.grid.PlayerData[this.fizzyText.username] = new Item("", 0, 0, 0, 0, false, 0, 0, 0, true, 0, undefined);
        this.vehicles[this.fizzyText.username] = window.bike;

        socket.emit("add_user", this.fizzyText.username, isTouchDevice());

        // Proceed with Three.js
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(100, window.innerWidth / window.innerHeight, 0.1, 5000);

        this.renderer = new THREE.WebGLRenderer({antialias: true});
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        document.body.appendChild(this.renderer.domElement);
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableKeys = false;
        this.controls.enableZoom = false;

        this.playMusic(this.camera);

        window.addEventListener("resize", function () {
            let width = window.innerWidth;
            let height = window.innerHeight;
            window.grid.renderer.setSize(width, height);
            window.grid.camera.aspect = width / height;
            window.grid.camera.updateProjectionMatrix();
        });

        const onProgress = function (xhr) {
            if (xhr.lengthComputable) {
                const percentComplete = xhr.loaded / xhr.total * 100;
                // TODO: create a loading screen
                console.log(Math.round(percentComplete) + "% downloaded");
            }
        };
        const onError = function () {
            console.log("Download error occurred");
        };

        const manager = new THREE.LoadingManager();
        manager.addHandler(/\.dds$/i, new DDSLoader());

        new MTLLoader(manager)
            .setPath("models/")
            .load("bike2.mtl", function (materials) {

                materials.preload();

                new OBJLoader(manager)
                    .setMaterials(materials)
                    .setPath("models/")
                    .load("bike2.obj", function (object) {
                        console.log('load');
                        let pivotPoint = new THREE.Object3D();
                        pivotPoint.add(object);
                        object.position.set(0, -0.3, 2);
                        window.template = pivotPoint;
                        window.bike = window.template.clone();
                        window.grid.scene.add(window.bike);

                    }, onProgress, onError);

            });

        new MTLLoader(manager)
            .setPath("models/")
            .load("arena7.mtl", function (materials) {

                materials.preload();

                new OBJLoader(manager)
                    .setMaterials(materials)
                    .setPath("models/")
                    .load("arena7.obj", function (object) {
                        window.arena = object;
                        window.grid.scene.add(window.arena);
                        window.arena.scale.set(40, 40, 40);
                        window.arena.position.set(20, 0, -20);

                    }, onProgress, onError);

            });


        // Animation settings
        this.clock = new THREE.Clock();
        this.settings = {
            'show model': true,
            'show skeleton': false,
            'deactivate all': this.deactivateAllActions,
            'activate all': this.activateAllActions,
            'pause/continue': this.pauseContinue,
            'modify step size': 0.05,
            'from walk to idle': function () {
                window.grid.prepareCrossFade(window.grid.walkAction, window.grid.idleAction, 1.0);
            },
            'from idle to walk': function () {
                window.grid.prepareCrossFade(window.grid.idleAction, window.grid.walkAction, 0.5);
            },
            'from walk to run': function () {
                window.grid.prepareCrossFade(window.grid.walkAction, window.grid.runAction, 2.5);
            },
            'from run to walk': function () {
                window.grid.prepareCrossFade(window.grid.runAction, window.grid.walkAction, 5.0);
            },
            'use default duration': true,
            'set custom duration': 1.5,
            'modify idle weight': 1.0,
            'modify walk weight': 0.0,
            'modify run weight': 0.0,
            'modify time scale': 1.0
        };

        const folder = window.grid.gui.addFolder( 'Crossfading' );
        this.crossFadeControls.push( folder.add( this.settings, 'from walk to idle' ) );
        this.crossFadeControls.push( folder.add( this.settings, 'from idle to walk' ) );
        this.crossFadeControls.push( folder.add( this.settings, 'from walk to run' ) );
        this.crossFadeControls.push( folder.add( this.settings, 'from run to walk' ) );
        folder.open();

        // Load animations
        const loader = new GLTFLoader();
        loader.load('three.js/examples/models/gltf/Soldier.glb', function (gltf) {
            window.grid.character = gltf.scene;

            window.grid.character.traverse(function (object) {
                if (object.isMesh) object.castShadow = true;
            });

            window.grid.skeleton = new THREE.SkeletonHelper( window.grid.character );
            window.grid.skeleton.visible = false;
            window.grid.scene.add(window.grid.skeleton);

            const animations = gltf.animations;

            window.grid.mixer = new THREE.AnimationMixer(window.grid.character);

            window.grid.idleAction = window.grid.mixer.clipAction(animations[0]);
            window.grid.walkAction = window.grid.mixer.clipAction(animations[3]);
            window.grid.runAction = window.grid.mixer.clipAction(animations[1]);

            window.grid.actions = [window.grid.idleAction, window.grid.walkAction, window.grid.runAction];
            window.grid.activateAllActions();
        });


        // light
        let ambientLight = new THREE.AmbientLight(0xFFFFFF, 8);
        this.scene.add(ambientLight);

        GameLoop();
        // this.gui.destroy();
    }

    appendPoint(trail_vertices, vector) {
        trail_vertices[lastBufferIndex++] = vector.x;
        trail_vertices[lastBufferIndex++] = vector.y;
        trail_vertices[lastBufferIndex++] = vector.z;

        return trail_vertices;
    }

    resetTrailData(key) {
        trail_geometry[key] = undefined;
        trail_vertices[key] = undefined;
        lastBufferIndex = 0;
    }


    updateCamera(data, json) {
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

        if (this.cameraIsNull) {
            // Init camera
            console.log('init camera');
            this.cameraIsNull = false;

            console.log(currentPlayer);

            this.camera.position.y = 10;
            this.camera.position.x = currentPlayer["x"] + 15 * Math.sin(currentPlayer["heading"] - Math.PI);
            this.camera.position.z = currentPlayer["z"] + 15 * Math.cos(currentPlayer["heading"] - Math.PI);

            lastX = currentPlayer["x"];
            lastY = currentPlayer["y"];
            lastZ = currentPlayer["z"];
            lastHeading = currentPlayer["heading"];

            // if (json) this.camera.lookAt(window.bike);
        } else {
            this.camera.position.x += currentPlayer["x"] - lastX;
            this.camera.position.y += currentPlayer["y"] - lastY;
            this.camera.position.z += currentPlayer["z"] - lastZ;

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
                let x = [this.camera.position.x, window.bike.position.x];
                let y = [this.camera.position.z, window.bike.position.z];
                this.camera.position.x = window.bike.position.x + (x[0] - x[1]) * Math.cos(angle) + (y[0] - y[1]) * (-Math.sin(angle));
                this.camera.position.z = window.bike.position.z + (x[0] - x[1]) * Math.sin(angle) + (y[0] - y[1]) * Math.cos(angle);

                lastHeading -= angle;
            }
        }

        lastX = currentPlayer["x"];
        lastY = currentPlayer["y"];
        lastZ = currentPlayer["z"];
    }

    updateTrail(data, key, json) {
        let trailQuality = 8;

        let allPlayers = {};
        if (json) {
            allPlayers = data[key];
        } else {
            allPlayers["heading"] = data[key].rotation.y;
            allPlayers["rotation"] = -data[key].rotation.z;
            allPlayers["x"] = data[key].position.x;
            allPlayers["y"] = data[key].position.y;
            allPlayers["z"] = data[key].position.z;
        }

        if (trail_geometry[key] === undefined) {
            // Init trail for a new player
            trail_geometry[key] = new THREE.BufferGeometry();
            trail_vertices[key] = new Float32Array(MAX_POINTS * 3);
            lastTrail[key] = [new THREE.Vector3(allPlayers["x"], allPlayers["y"], allPlayers["z"]),
                new THREE.Vector3(allPlayers["x"], allPlayers["y"] + 1, allPlayers["z"])];
            mainLastTrail[key] = Object.assign({}, lastTrail[key]);


            // Trail init
            trail_geometry[key].setAttribute("position", new THREE.BufferAttribute(trail_vertices[key], 3));
            let trail_material = new THREE.MeshBasicMaterial({color: 0x0fbef2, wireframe: false});
            let mesh = new THREE.Mesh(trail_geometry[key], trail_material);
            mesh.name = "trail";
            this.scene.add(mesh);
            mesh.traverse(function (node) {
                if (node.material) {
                    node.material.side = THREE.DoubleSide;
                }
            });
            mesh.frustumCulled = false;
        } else {
            // console.log(mainLastTrail);
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
            trail_vertices[key] = this.appendPoint(trail_vertices[key], mainLastTrail[key][0]);
            trail_vertices[key] = this.appendPoint(trail_vertices[key], mainLastTrail[key][1]);
            trail_vertices[key] = this.appendPoint(trail_vertices[key], new THREE.Vector3(allPlayers["x"], allPlayers["y"], allPlayers["z"]));

            let a = (Math.PI / 2) - (allPlayers["heading"]);
            let top_bike = new THREE.Vector3(allPlayers["x"] + Math.sin(allPlayers["rotation"] * Math.sin(a)),
                allPlayers["y"] + Math.cos(allPlayers["rotation"]), // Height
                allPlayers["z"] - Math.sin(allPlayers["rotation"]) * Math.cos(a))

            trail_vertices[key] = this.appendPoint(trail_vertices[key], top_bike);
            trail_vertices[key] = this.appendPoint(trail_vertices[key], allPlayers);
            trail_vertices[key] = this.appendPoint(trail_vertices[key], mainLastTrail[key][1]);

            lastTrail[key][1] = top_bike;
            lastTrail[key][0] = new THREE.Vector3(allPlayers["x"], allPlayers["y"], allPlayers["z"]);
        }
    }


    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }


    initStats() {
        this.stats = new Stats();
        this.stats.setMode(0); // 0: fps, 1: ms

        // Align top-left
        this.stats.domElement.style.position = "absolute";
        this.stats.domElement.style.left = "0px";
        this.stats.domElement.style.top = "0px";
        document.body.appendChild(this.stats.dom);
    }


    playMusic() {
        // Create an AudioListener and add it to the this.camera
        const listener = new THREE.AudioListener();
        this.camera.add(listener);

        // Create a global audio source
        const sound = new THREE.Audio(listener);

        // Load a sound and set it as the Audio object's buffer
        const audioLoader = new THREE.AudioLoader();
        audioLoader.load('sounds/tron_legacy.mp3', function (buffer) {
            sound.setBuffer(buffer);
            sound.setLoop(true);
            sound.setVolume(0.5);
            // sound.play();
        });
    }


    prepareCrossFade(startAction, endAction, defaultDuration) {
        // Switch default / custom crossfade duration (according to the user's choice)
        const duration = this.setCrossFadeDuration(defaultDuration, this);

        // Make sure that we don't go on in singleStepMode, and that all actions are unpaused
        this.unPauseAllActions(this);

        // If the current action is 'idle' (duration 4 sec), execute the crossfade immediately;
        // else wait until the current action has finished its current loop
        if (startAction === this.idleAction) {
            this.executeCrossFade(startAction, endAction, duration);
        } else {
            this.synchronizeCrossFade(startAction, endAction, duration);
        }
    }


    setCrossFadeDuration(defaultDuration) {
        // Switch default crossfade duration <-> custom crossfade duration

        if (this.settings['use default duration']) {
            return defaultDuration;
        } else {
            return this.settings['set custom duration'];
        }
    }


    synchronizeCrossFade(startAction, endAction, duration) {
        this.mixer.addEventListener('loop', onLoopFinished);

        function onLoopFinished(event) {
            if (event.action === startAction) {
                this.mixer.removeEventListener('loop', onLoopFinished);

                executeCrossFade(startAction, endAction, duration);
            }
        }
    }


    executeCrossFade(startAction, endAction, duration) {
        // Not only the start action, but also the end action must get a weight of 1 before fading
        // (concerning the start action this is already guaranteed in this place)

        setWeight(endAction, 1);
        endAction.time = 0;

        // Crossfade with warping - you can also try without warping by setting the third parameter to false

        startAction.crossFadeTo(endAction, duration, true);
    }


    // This function is needed, since animationAction.crossFadeTo() disables its start action and sets
    // the start action's timeScale to ((start animation's duration) / (end animation's duration))
    setWeight(action, weight) {
        action.enabled = true;
        action.setEffectiveTimeScale(1);
        action.setEffectiveWeight(weight);
    }


    // Controlling actions (stop, play, pause)
    activateAllActions() {
        this.setWeight(this.idleAction, this.settings['modify idle weight']);
        this.setWeight(this.walkAction, this.settings['modify walk weight']);
        this.setWeight(this.runAction, this.settings['modify run weight']);

        this.actions.forEach(function (action) {
            action.play();
        });
    }


    deactivateAllActions() {
        this.actions.forEach(function (action) {
            action.stop();
        });
    }


    pauseContinue() {
        if (this.idleAction.paused) {
            unPauseAllActions();
        } else {
            pauseAllActions();
        }
    }


    unPauseAllActions() {
        this.actions.forEach(function (action) {
            action.paused = false;
        });
    }
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
window.onload = function() {
    window.state = "title_screen";

    // Declare socket events
    socket.on("clear", function() {
        while (window.grid.scene.getObjectByName("trail") !== undefined) {
            let selectedObject = window.grid.scene.getObjectByName("trail");
            window.grid.scene.remove(selectedObject);
        }

        for (let id in window.grid.allVehicles) {
            window.grid.resetTrailData(id);
        }
        window.grid.cameraIsNull = true;
    });


    socket.on("booster", function(msg) {
        if (window.state === "game") {
            let b = JSON.parse(msg);
            const geometry = new THREE.SphereGeometry(4, 32, 32);
            const material = new THREE.MeshBasicMaterial({color: 0xff00ff});
            for (let i = 0; i < b.length; i++) {
                window.grid.boosters.push(new THREE.Mesh(geometry, material));
                window.grid.boosters[i].position.set(b[i].x, b[i].y, b[i].z);
                window.grid.scene.add(window.grid.boosters[i]);
            }
        }
    });

    socket.on("pingclient", function() {
        if (window.state === "game") {
            socket.emit("pingserver", window.grid.fizzyText.username);
        }
    });

    socket.on("exit_bike", function() {
        window.grid.controls.enableZoom = true;
    });


    socket.on("update", function(msg) {
        if (window.state !== "game" || typeof window.bike === "undefined") {
            return;
        }

        let parsed = JSON.parse(msg);  // Parsed data from server
        window.grid.allPlayers = parsed["players"];
        console.log(window.grid.allPlayers);

        window.grid.allVehicles = parsed["vehicles"];

        let current_vehicle_id = window.grid.allPlayers[window.grid.fizzyText.username]["current_vehicle"]

        // Display main character
        if (current_vehicle_id == null) {
            // Display character

            // let copy = this.character.clone();
            window.grid.scene.add(window.grid.character);
            window.grid.characters[window.grid.fizzyText.username] = window.grid.character;

            window.grid.character.position.x = window.grid.allPlayers[window.grid.fizzyText.username].x;
            window.grid.character.position.y = window.grid.allPlayers[window.grid.fizzyText.username].y;
            window.grid.character.position.z = window.grid.allPlayers[window.grid.fizzyText.username].z;

            console.log(window.grid.character.x, window.grid.character.y, window.grid.character.z);

        } else {
            let currentPlayer = window.grid.allVehicles[current_vehicle_id];

            if (currentPlayer === undefined) {
                return;
            }

            window.grid.updateCamera(currentPlayer, true);

            // Update user's bike
            window.bike.position.set(currentPlayer["x"], currentPlayer["y"], currentPlayer["z"]);
            window.bike.rotation.y = currentPlayer["heading"];
            window.bike.rotation.z = -currentPlayer["rotation"];
            window.grid.controls.target.set(window.bike.position.x, window.bike.position.y, window.bike.position.z);

            // Update boosters counter
            let boostersgui = document.getElementsByClassName("boosters")[0].getElementsByTagName("div");
            for (let i = 0; i < 5; i++) {
                let boost = boostersgui[i];
                if (i < currentPlayer["boosters"]) {
                    boost.setAttribute("class", "purple")
                } else {
                    boost.setAttribute("class", "grey")
                }
            }

            // Update score
            document.getElementById("scorenumber").innerHTML = currentPlayer["score"];
        }

        // Display other characters on bikes
        for (let player in window.grid.allPlayers) {
            if (window.grid.allPlayers[player]["current_vehicle"] !== null) {
                let key = window.grid.allPlayers[player]["current_vehicle"];

                // Trail
                window.grid.updateTrail(window.grid.allVehicles, key, true);

                if (key !== current_vehicle_id) {
                    if (window.grid.vehicles[key] === undefined) {
                        // New player
                        let copy = window.template.clone();
                        window.grid.scene.add(copy);
                        window.grid.vehicles[key] = copy;
                        window.key = player;

                        let Item = makeStruct("player_name speed heading booster score" +
                            " dead trail_size rotation boost_time toggle_controls_rotation max_turn_angle last_collision_check");
                        PlayerData[key] = new Item("", 0, 0, 0, 0, false, 0, 0, 0, true, 0, undefined);

                        // Display usernames
                        const geometry = new TextGeometry(window.key, {
                            font: window.font,
                            size: 80,
                            height: 3,
                            curveSegments: 12,
                            bevelEnabled: true,
                            bevelThickness: 1,
                            bevelSize: 1,
                            bevelOffset: 0,
                            bevelSegments: 5
                        });

                        geometry.computeBoundingBox();
                        geometry.center();
                        const material = new THREE.MeshPhongMaterial({color: 0x444444});
                        let text = new THREE.Mesh(geometry, material);

                        text.scale.set(0.015, 0.015, 0.015);
                        window.names[key] = text;
                        window.grid.scene.add(text);
                    } else {
                        // Update players cars
                        vehicles[key].position.set(this.allVehicles[key].x, this.allVehicles[key].y, this.allVehicles[key].z);
                        vehicles[key].rotation.y = this.allVehicles[key].heading;
                        window.names[key].position.set(this.allVehicles[key].x, this.allVehicles[key].y + 3, this.allVehicles[key].z);
                        // Rotate username to face user
                        window.names[key].lookAt(camera.position.x, 3, camera.position.z);
                    }
                }
            }
        }

        for (let key in this.allVehicles) {
            let vehicle = this.allVehicles[key];
            if (vehicle["empty_bike"]) {
                if (vehicles[key] === undefined) {
                    // New player
                    let copy = window.template.clone();
                    window.grid.scene.add(copy);
                    vehicles[key] = copy;

                    vehicles[key].position.set(this.allVehicles[key].x, this.allVehicles[key].y, this.allVehicles[key].z);
                    vehicles[key].rotation.y = this.allVehicles[key].heading;
                }
            }
        }
    });


    // Key events
    document.addEventListener("keydown", onDocumentKeyDown, false);
    function onDocumentKeyDown(event) {
        if (window.state === "title_screen") {
            if (event.which === 13 || event.which === 32) {
                // Pressed enter, init game

                window.grid = new Game();

                // Dat Gui controls setup
                window.grid.init();
                window.grid.fizzyText = new window.grid.FizzyText();
                window.grid.gui = new dat.GUI({
                    load: JSON,
                    preset: "Flow",
                    width: 700
                });

                window.grid.gui.add(window.grid.fizzyText, "username").name("Enter username");
                window.grid.gui.add(window.grid.fizzyText, "submitName").name("Enter game");

                window.state = "nickname_select";
            }
        } else if (window.state === "nickname_select") {
            // Do nothing
        } else if (window.state === "game") {
            socket.emit("keydown", {"user": window.grid.fizzyText.username, "key": event.which});
            if (event.which === 68) {
                window.grid.PlayerData[window.grid.fizzyText.username].max_turn_angle = 0.7;
            } else if (event.which === 65) {
                window.grid.PlayerData[window.grid.fizzyText.username].max_turn_angle = -0.7;
            }
        }
    }

    document.addEventListener("keyup", onDocumentKeyUp, false);
    function onDocumentKeyUp(event) {
        if (window.state === "game") {
            socket.emit("keyup", {"user": window.grid.fizzyText.username, "key": event.which});
            if (event.which === 68) {
                window.grid.PlayerData[window.grid.fizzyText.username].max_turn_angle = -0.0001;
            } else if (event.which === 65) {
                window.grid.PlayerData[window.grid.fizzyText.username].max_turn_angle = 0.0001;
            }
        }
    }


    const loader = new FontLoader();
    loader.load( "models/font.json", function (font) {
        window.font = font;
    });


    // function update_locally() {
    //     if (window.state !== "game") return;
    //
    //     let current_time = Date.now();
    //     for (let bike_key in vehicles) {
    //         if (PlayerData[bike_key].max_turn_angle > 0) {
    //             // Right turn
    //             vehicles[bike_key].rotation.z = Math.min(vehicles[bike_key].rotation.z + 0.02,
    //                 PlayerData[bike_key].max_turn_angle)
    //         } else {
    //             // Left turn
    //             vehicles[bike_key].rotation.z = Math.max(vehicles[bike_key].rotation.z - 0.02,
    //                 PlayerData[bike_key].max_turn_angle)
    //         }
    //
    //         if (PlayerData[bike_key].boost_time <= 0) {
    //             // Reset player speed to normal
    //             PlayerData[bike_key].speed = Math.min(0.03, PlayerData[bike_key].speed + 0.1)
    //         } else {
    //             // Update boost time
    //             PlayerData[bike_key].boost_time -= (current_time - last_time);
    //         }
    //
    //         // Update heading
    //         vehicles[bike_key].rotation.y += (current_time - last_time) * -vehicles[bike_key].rotation.z * 0.001
    //         let speed = (current_time - last_time) * PlayerData[bike_key].speed;
    //
    //         vehicles[bike_key].position.x += speed * Math.sin(vehicles[bike_key].rotation.y);
    //         vehicles[bike_key].position.z += speed * Math.cos(vehicles[bike_key].rotation.y);
    //
    //         window.grid.scene = window.grid.updateTrail(vehicles, bike_key, false);
    //         camera = window.grid.updateCamera(camera, vehicles[bike_key], false);
    //         camera.lookAt(window.bike.position.x, window.bike.position.y, window.bike.position.z);
    //     }
    //     last_time = current_time;
    // }


    // Main loop
    GameLoop = function() {
        requestAnimationFrame(GameLoop);
        window.grid.stats.begin();
        window.grid.controls.update();

        // this.idleWeight = window.grid.idleAction.getEffectiveWeight();
        // this.walkWeight = window.grid.walkAction.getEffectiveWeight();
        // this.runWeight = window.grid.runAction.getEffectiveWeight();

        // Get the time elapsed since the last frame, used for mixer update (if not in single step mode)
        // let mixerUpdateDelta = window.grid.clock.getDelta();
        // window.grid.mixer.update(mixerUpdateDelta);

        // This function is preserved for better times
        // update_locally();

        window.grid.renderer.render(window.grid.scene, window.grid.camera);
        window.grid.stats.end();
    };

    // Window close event
    window.onunload = function() {
        if (window.state === "game") {
            socket.emit("remove_user", window.grid.fizzyText.username);
            window.grid.sleep(1000);
        }
    }
};
