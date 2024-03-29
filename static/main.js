import * as THREE from "./three.module.js";

import * as GRID from "./methods.js"


let socket = io("http://" + window.location.hostname + ":" + window.location.port);

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


window.onload = function() {
    let tmp = GRID.init();
    let scene = tmp[0];
    let renderer = tmp[1];
    let camera = tmp[2];
    let controls = tmp[3];
    let boosters = []

    let allPlayers, currentPlayer, vehicles = {}, lastX = 0, lastY = 0, lastZ = 0, lastHeading = 0, lastTrail = {}, mainLastTrail = {};
    window.gameBegin = false;
    window.names = {};
    const MAX_POINTS = 30000;
    let lastBufferIndex = 0, cameraIsNull = true;


    const FizzyText = function () {
        this.username = GRID.generateUsername(6);
        this.error = "";

        this.submitName = function () {
            // create an AudioListener and add it to the camera
            const listener = new THREE.AudioListener();
            camera.add( listener );

            // create a global audio source
            const sound = new THREE.Audio( listener );

            // load a sound and set it as the Audio object's buffer
            const audioLoader = new THREE.AudioLoader();
            audioLoader.load( 'sounds/tron_legacy.mp3', function( buffer ) {
                sound.setBuffer( buffer );
                sound.setLoop( true );
                sound.setVolume( 0.5 );
                sound.play();
            });

            this.username = this.username.toLowerCase();
            let res = httpGet("/check/" + this.username);
            if (res["status"] === "true" || this.username.length >= 30 || res["error"] === "true") {
                if (this.error === "") {
                    this.error = "This username is already taken or contains Non-English letters"
                    let e = gui.add(fizzyText, "error").name("Error");
                    e.domElement.style.pointerEvents = "none";
                }
            } else {
                if (isTouchDevice()) {
                    document.getElementsByClassName("controls")[0].innerHTML =
                        "<div class=\"buttonleft\">\n" +
                        "                <img src=\"icons/left1.svg\" alt=\"Left\" width=\"100%\" height=\"100%\">\n" +
                        "            </div>\n" +
                        "            <div class=\"buttonright\">\n" +
                        "                <img src=\"icons/right1.svg\" alt=\"Right\" width=\"100%\" height=\"100%\">\n" +
                        "            </div>";

                    document.getElementsByClassName("boost")[0].innerHTML =
                        "<div class=\"buttonboost\">\n" +
                        "                <img src=\"icons/boost1.svg\" alt=\"Boost\" width=\"100%\" height=\"100%\">\n" +
                        "            </div>\n";

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
                        socket.emit("keydown", {"user": fizzyText.username, "key": 65});
                    }

                    function process_touchend_l(ev) {
                        ev.preventDefault();
                        socket.emit("keyup", {"user": fizzyText.username, "key": 65});
                    }

                    function process_touchstart_r(ev) {
                        ev.preventDefault();
                        socket.emit("keydown", {"user": fizzyText.username, "key": 68});
                    }

                    function process_touchend_r(ev) {
                        ev.preventDefault();
                        socket.emit("keyup", {"user": fizzyText.username, "key": 68});
                    }

                    function process_touchstart_b(ev) {
                        ev.preventDefault();
                        socket.emit("keydown", {"user": fizzyText.username, "key": 16});
                    }
                }
                window.gameBegin = true;
                socket.emit("add_user", fizzyText.username, isTouchDevice());
                GameLoop();
                gui.destroy();
            }
        };
    };


    let stats = GRID.initStats(Stats);

    // Dat Gui controls setup
    let fizzyText = new FizzyText();
    let gui = new dat.GUI({
        load: JSON,
        preset: "Flow",
        width: 700
    });

    gui.add(fizzyText, "username").name("Enter username");
    gui.add(fizzyText, "submitName").name("Enter game");


    socket.on("connect", function() {
        socket.emit("message", "I am connected");
    });

    socket.on("clear", function() {
        while (scene.getObjectByName("trail") !== undefined) {
            let selectedObject = scene.getObjectByName("trail");
            scene.remove(selectedObject);
        }

        for (let key in allPlayers) {
            trail_geometry[key] = undefined;
        }
    });


    socket.on("booster", function(msg) {
        let b = JSON.parse(msg);
        const geometry = new THREE.SphereGeometry( 2, 32, 32 );
        const material = new THREE.MeshBasicMaterial( {color: 0xff00ff} );
        for (let i = 0; i < b.length; i++){
            boosters.push(new THREE.Mesh( geometry, material ));
            boosters[i].position.set(b[i].x, b[i].y, b[i].z);
            scene.add(boosters[i]);
        }
    });


    socket.on("update", function(msg) {
        if (!window.gameBegin || typeof window.bike === "undefined") {
            return;
        }

        allPlayers = JSON.parse(msg);
        currentPlayer = allPlayers[fizzyText.username];
        if (currentPlayer === undefined) {
            return;
        }

        if (cameraIsNull) {
            cameraIsNull = false;

            camera.position.y = 10;
            camera.position.x = currentPlayer["x"] + 15 * Math.sin(currentPlayer["heading"] - Math.PI);
            camera.position.z = currentPlayer["z"] + 15 * Math.cos(currentPlayer["heading"] - Math.PI);

            lastX = currentPlayer["x"];
            lastY = currentPlayer["y"];
            lastZ = currentPlayer["z"];
            lastHeading = currentPlayer["heading"];

            camera.lookAt(window.bike);
        } else {
            camera.position.x += currentPlayer["x"] - lastX;
            camera.position.y += currentPlayer["y"] - lastY;
            camera.position.z += currentPlayer["z"] - lastZ;

            let angle = lastHeading - currentPlayer["heading"];
            if (angle >= 360) {
                lastHeading += Math.trunc(angle / 360) * 360;
            }
            if (Math.abs(angle) >= 0.0001 && currentPlayer["controls"]) {
                if (angle > 0) {
                    angle = Math.min(angle, 0.04);
                } else {
                    angle = Math.max(angle, -0.04);
                }
                let x = [camera.position.x, window.bike.position.x];
                let y = [camera.position.z, window.bike.position.z];
                camera.position.x = window.bike.position.x + (x[0] - x[1]) * Math.cos(angle) + (y[0] - y[1]) * (-Math.sin(angle));
                camera.position.z = window.bike.position.z + (x[0] - x[1]) * Math.sin(angle) + (y[0] - y[1]) * Math.cos(angle);

                lastHeading -= angle;
            }
        }

        // Update user's bike
        window.bike.position.set(currentPlayer["x"], currentPlayer["y"], currentPlayer["z"]);
        window.bike.rotation.y = currentPlayer["heading"];
        window.bike.rotation.z = -currentPlayer["rotation"];
        controls.target.set(window.bike.position.x, window.bike.position.y, window.bike.position.z);

        // Update boosters counter
        let boostersgui = document.getElementsByClassName("boosters")[0].getElementsByTagName("div");
        for(var i = 0; i < 5; i++){
            let boost = boostersgui[i];
            if (i < currentPlayer["boosters"]){
                boost.setAttribute("class", "purple")
            }
            else {
                boost.setAttribute("class", "grey")
            }
        }
        // Update score
        document.getElementById("scorenumber").innerHTML = currentPlayer["score"];


        // Display all players
        for (let key in allPlayers) {
            // Trail
            if (trail_geometry[key] === undefined) {
                // Init trail
                trail_geometry[key] = new THREE.BufferGeometry();
                trail_vertices[key] = new Float32Array(MAX_POINTS * 3);
                lastTrail[key] = [new THREE.Vector3(allPlayers[key]["x"], allPlayers[key]["y"], allPlayers[key]["z"]),
                    new THREE.Vector3(allPlayers[key]["x"], allPlayers[key]["y"] + 1, allPlayers[key]["z"])];
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
                let dx = Math.abs(mainLastTrail[key][0].x - allPlayers[key]["x"]);
                let dz = Math.abs(mainLastTrail[key][0].z - allPlayers[key]["z"]);


                if (dx * dx + dz * dz <= 10 && lastBufferIndex > 0) {
                    // Update just last poly of the trail
                    lastBufferIndex = Math.max(lastBufferIndex - 18, 0);
                } else {
                    if (lastBufferIndex !== 0) {
                        mainLastTrail[key] = Object.assign({}, lastTrail[key]);
                    }
                }

                trail_geometry[key].setAttribute("position", new THREE.BufferAttribute(trail_vertices[key], 3));

                // Update trail by creating new poly
                trail_vertices[key] = appendPoint(trail_vertices[key], mainLastTrail[key][0]);
                trail_vertices[key] = appendPoint(trail_vertices[key], mainLastTrail[key][1]);
                trail_vertices[key] = appendPoint(trail_vertices[key], new THREE.Vector3(allPlayers[key]["x"], allPlayers[key]["y"], allPlayers[key]["z"]));

                let a = (Math.PI / 2) - (allPlayers[key]["heading"]);
                let top_bike = new THREE.Vector3(allPlayers[key]["x"] + Math.sin(allPlayers[key]["rotation"] * Math.sin(a)),
                    allPlayers[key]["y"] + Math.cos(allPlayers[key]["rotation"]), // Height
                    allPlayers[key]["z"] - Math.sin(allPlayers[key]["rotation"]) * Math.cos(a))

                trail_vertices[key] = appendPoint(trail_vertices[key], top_bike);
                trail_vertices[key] = appendPoint(trail_vertices[key], allPlayers[key]);
                trail_vertices[key] = appendPoint(trail_vertices[key], mainLastTrail[key][1]);

                lastTrail[key][1] = top_bike;
                lastTrail[key][0] = new THREE.Vector3(allPlayers[key]["x"], allPlayers[key]["y"], allPlayers[key]["z"]);
            }

            if (key !== fizzyText.username) {
                if (vehicles[key] === undefined) {
                    let copy = window.template.clone();
                    scene.add(copy);
                    vehicles[key] = copy;
                    window.key = key;

                    // Display usernames
                    const geometry = new THREE.TextGeometry(window.key, {
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
                    const material = new THREE.MeshPhongMaterial( {color: 0x444444} );
                    let text = new THREE.Mesh(geometry, material);

                    text.scale.set(0.015, 0.015, 0.015);
                    window.names[window.key] = text;
                    scene.add(text);
                } else {
                    // Update players cars
                    vehicles[key].position.set(allPlayers[key].x, allPlayers[key].y, allPlayers[key].z);
                    vehicles[key].rotation.y = allPlayers[key].heading;
                    window.names[key].position.set(allPlayers[key].x, allPlayers[key].y + 3, allPlayers[key].z);
                    // Rotate username to face user
                    window.names[key].lookAt(camera.position.x, 3, camera.position.z);
                }
            }
        }

        lastX = currentPlayer["x"];
        lastY = currentPlayer["y"];
        lastZ = currentPlayer["z"];
    });


    // Keys events
    document.addEventListener("keydown", onDocumentKeyDown, false);
    function onDocumentKeyDown(event) {
        if (window.gameBegin) {
            socket.emit("keydown", {"user": fizzyText.username, "key": event.which});
        }
    }

    document.addEventListener("keyup", onDocumentKeyUp, false);
    function onDocumentKeyUp(event) {
        if (window.gameBegin) {
            socket.emit("keyup", {"user": fizzyText.username, "key": event.which});
        }
    }


    const loader = new THREE.FontLoader();
    loader.load( "models/font.json", function (font) {
        window.font = font;
    });

    let trail_geometry = {};
    let trail_vertices = {};


    function appendPoint(trail_vertices, vector) {
        trail_vertices[lastBufferIndex ++] = vector.x;
        trail_vertices[lastBufferIndex ++] = vector.y;
        trail_vertices[lastBufferIndex ++] = vector.z;

        return trail_vertices
    }


    function update_locally() {

    }


    // Main loop
    let GameLoop = function() {
        requestAnimationFrame(GameLoop);
        stats.begin();
        controls.update();

        update_locally()

        renderer.render(scene, camera);
        stats.end();
    };

    // Window close event
    window.onunload = function() {
        if (window.gameBegin) {
            socket.emit("remove_user", fizzyText.username);
            GRID.sleep(1000);
        }
    }
};
