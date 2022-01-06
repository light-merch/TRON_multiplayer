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


function makeStruct(names) {
    var names = names.split(' ');
    var count = names.length;
    function constructor() {
        for (var i = 0; i < count; i++) {
            this[names[i]] = arguments[i];
        }
    }
    return constructor;
}


window.onload = function() {
    let tmp = GRID.init();
    let scene = tmp[0];
    let renderer = tmp[1];
    let camera = tmp[2];
    let controls = tmp[3];
    let boosters = []

    let allPlayers, vehicles = {}, last_time = Date.now();
    let PlayerData = {};

    window.gameBegin = false;
    window.names = {};



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
                        PlayerData[window.username].max_turn_angle = 0.7;
                    }

                    function process_touchend_l(ev) {
                        ev.preventDefault();
                        socket.emit("keyup", {"user": fizzyText.username, "key": 65});
                        PlayerData[window.username].max_turn_angle = -0.0001;
                    }

                    function process_touchstart_r(ev) {
                        ev.preventDefault();
                        socket.emit("keydown", {"user": fizzyText.username, "key": 68});
                        PlayerData[window.username].max_turn_angle = -0.7;
                    }

                    function process_touchend_r(ev) {
                        ev.preventDefault();
                        socket.emit("keyup", {"user": fizzyText.username, "key": 68});
                        PlayerData[window.username].max_turn_angle = 0.0001;
                    }

                    function process_touchstart_b(ev) {
                        ev.preventDefault();
                        socket.emit("keydown", {"user": fizzyText.username, "key": 16});
                    }
                }
                window.gameBegin = true;

                let Item = makeStruct("player_name speed heading booster score" +
                    " dead trail_size rotation boost_time toggle_controls_rotation max_turn_angle last_collision_check");
                PlayerData[this.username] = new Item("", 0, 0, 0, 0, false, 0, 0, 0, true, 0, undefined);
                vehicles[this.username] = window.bike;

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
            GRID.resetTrailData(key);
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

        allPlayers = JSON.parse(msg);  // Parsed data from server
        let currentPlayer = allPlayers[fizzyText.username];
        if (currentPlayer === undefined) {
            return;
        }

        GRID.updateCamera(camera, currentPlayer, true);

        // Update user's bike
        window.bike.position.set(currentPlayer["x"], currentPlayer["y"], currentPlayer["z"]);
        window.bike.rotation.y = currentPlayer["heading"];
        window.bike.rotation.z = -currentPlayer["rotation"];
        controls.target.set(window.bike.position.x, window.bike.position.y, window.bike.position.z);

        // Update boosters counter
        let boostersgui = document.getElementsByClassName("boosters")[0].getElementsByTagName("div");
        for (let i = 0; i < 5; i++) {
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
            scene = GRID.updateTrail(allPlayers, scene, key, true);

            if (key !== fizzyText.username) {
                if (vehicles[key] === undefined) {
                    // New player
                    let copy = window.template.clone();
                    scene.add(copy);
                    vehicles[key] = copy;
                    window.key = key;

                    let Item = makeStruct("player_name speed heading booster score" +
                        " dead trail_size rotation boost_time toggle_controls_rotation max_turn_angle last_collision_check");
                    PlayerData[key] = new Item("", 0, 0, 0, 0, false, 0, 0, 0, true, 0, undefined);

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
    });


    // Keys events
    document.addEventListener("keydown", onDocumentKeyDown, false);
    function onDocumentKeyDown(event) {
        if (window.gameBegin) {
            socket.emit("keydown", {"user": fizzyText.username, "key": event.which});
            if (event.which === 68) {
                PlayerData[fizzyText.username].max_turn_angle = 0.7;
            } else if (event.which === 65) {
                PlayerData[fizzyText.username].max_turn_angle = -0.7;
            }
        }
    }

    document.addEventListener("keyup", onDocumentKeyUp, false);
    function onDocumentKeyUp(event) {
        if (window.gameBegin) {
            socket.emit("keyup", {"user": fizzyText.username, "key": event.which});
            if (event.which === 68) {
                PlayerData[fizzyText.username].max_turn_angle = -0.0001;
            } else if (event.which === 65) {
                PlayerData[fizzyText.username].max_turn_angle = 0.0001;
            }
        }
    }


    const loader = new THREE.FontLoader();
    loader.load( "models/font.json", function (font) {
        window.font = font;
    });


    function update_locally() {
        if (!window.gameBegin) return;

        let current_time = Date.now();
        for (let bike_key in vehicles) {
            if (PlayerData[bike_key].max_turn_angle > 0) {
                // Right turn
                vehicles[bike_key].rotation.z = Math.min(vehicles[bike_key].rotation.z + 0.02,
                    PlayerData[bike_key].max_turn_angle)
            } else {
                // Left turn
                vehicles[bike_key].rotation.z = Math.max(vehicles[bike_key].rotation.z - 0.02,
                    PlayerData[bike_key].max_turn_angle)
            }

            if (PlayerData[bike_key].boost_time <= 0) {
                // Reset player speed to normal
                PlayerData[bike_key].speed = Math.min(0.03, PlayerData[bike_key].speed + 0.1)
            } else {
                // Update boost time
                PlayerData[bike_key].boost_time -= (current_time - last_time);
            }

            // Update heading
            vehicles[bike_key].rotation.y += (current_time - last_time) * -vehicles[bike_key].rotation.z * 0.001
            let speed = (current_time - last_time) * PlayerData[bike_key].speed;

            vehicles[bike_key].position.x += speed * Math.sin(vehicles[bike_key].rotation.y);
            vehicles[bike_key].position.z += speed * Math.cos(vehicles[bike_key].rotation.y);

            scene = GRID.updateTrail(vehicles, scene, bike_key, false);
            camera = GRID.updateCamera(camera, vehicles[bike_key], false);
            camera.lookAt(window.bike.position.x, window.bike.position.y, window.bike.position.z);
        }
        last_time = current_time;
    }


    // Main loop
    let GameLoop = function() {
        requestAnimationFrame(GameLoop);
        stats.begin();
        controls.update();

        // This function if preserved for better times
        // update_locally();

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
