import * as THREE from "./three.module.js";

import { OrbitControls } from "./OrbitControls.js";
import { OBJLoader } from './OBJLoader.js';
import { MTLLoader } from './MTLLoader.js';
import { DDSLoader } from './DDSLoader.js';


function httpGet(Url) {
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open("GET", Url, false); // false for synchronous request
    xmlHttp.send(null);
    return JSON.parse(xmlHttp.responseText);
}


function fileGet(file_name) {
    var rawFile = new XMLHttpRequest();
    var allText = "";
    rawFile.open("GET", file_name, false);
    rawFile.onreadystatechange = function () {
        if(rawFile.readyState === 4) {
            if(rawFile.status === 200 || rawFile.status === 0) {
                allText = rawFile.responseText;
            }
        }
    };
    rawFile.send(null);
    return JSON.parse(allText);
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
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    var renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setSize(window.innerWidth, window.innerHeight);

    document.body.appendChild(renderer.domElement);
    var controls = new OrbitControls(camera, renderer.domElement);
    controls.enableKeys = false;
    // controls.autoRotate = true;
    // controls.autoRotateSpeed = 3;

    window.addEventListener("resize", function () {
        var width = window.innerWidth;
        var height = window.innerHeight;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    });

    const onProgress = function ( xhr ) {

        if ( xhr.lengthComputable ) {

            const percentComplete = xhr.loaded / xhr.total * 100;
            console.log( Math.round( percentComplete, 2 ) + '% downloaded' );

        }

    };
    const onError = function () { };

    const manager = new THREE.LoadingManager();
    manager.addHandler( /\.dds$/i, new DDSLoader() );

    new MTLLoader( manager )
        .setPath( 'models/' )
        .load( 'lightcycle.mtl', function ( materials ) {

            materials.preload();

            new OBJLoader( manager )
                .setMaterials( materials )
                .setPath( 'models/' )
                .load( 'lightcycle.obj', function ( object ) {

                    window.bike = object;
                    scene.add( object );

                }, onProgress, onError );

        } );

    // light
    var directionalLight = new THREE.DirectionalLight(0xFFFFFF, 1);
    directionalLight.position.set(6, 8, 8);
    scene.add(directionalLight);

    directionalLight = new THREE.DirectionalLight(0xFFFFFF, 1);
    directionalLight.position.set(-6, -8, -8);
    scene.add(directionalLight);

    var ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.7);
    scene.add(ambientLight);

    camera.position.set(0, 5, -6);

    camera.rotation.y = 3.14;
    camera.rotation.x = 0.6;

    return [scene, renderer, camera, controls]
}




window.onload = function() {
    const FizzyText = function () {
        this.name = "Pavel Artushkov";

        this.reset_defaults = function () {
            for (var i = 0; i < gui.__controllers.length; i++) {
                gui.__controllers[i].setValue(gui.__controllers[i].initialValue);
            }
        };
    };


    var stats = initStats(Stats);

    // Dat Gui controls setup
    var fizzyText = new FizzyText();
    var gui = new dat.GUI({
        load: JSON,
        preset: "Flow",
        width: 300
    });


    class Player {
        constructor(last_trail_x, last_trail_y, last_trail_z) {
            this.last_trail_x = last_trail_x;
            this.last_trail_y = last_trail_y;
            this.last_trail_z = last_trail_z;
        }
    }
    var player = new Player(0, 1, -3);


    document.addEventListener("keydown", onDocumentKeyDown, false);
    function onDocumentKeyDown(event) {
        var keyCode = event.which;
        console.log(keyCode);
        if (keyCode === 32) { // Space
            // fizzyText.play = !fizzyText.play;
        } else if (keyCode === 65) { // A
            window.bike.rotation.z -= 0.1;
        } else if (keyCode === 68) { // D
            window.bike.rotation.z += 0.1;
        }
    }


    var tmp = init();
    var scene = tmp[0];
    var renderer = tmp[1];
    var camera = tmp[2];
    var controls = tmp[3];

    const trail_geometry = new THREE.BoxGeometry( 0.05, 1, 1 );
    const trail_material = new THREE.MeshBasicMaterial( {color: 0x0fbef2} );

    var GameLoop = function() {
        requestAnimationFrame(GameLoop);
        stats.begin();
        controls.update();

        if (window.bike !== undefined) {
            window.bike.position.z += 0.1;
            camera.position.z += 0.1;

            controls.target.set(window.bike.position.x, window.bike.position.y, window.bike.position.z);

            var trail = new THREE.Mesh(trail_geometry, trail_material);
            trail.position.set(player.last_trail_x, player.last_trail_y, player.last_trail_z);
            scene.add(trail);
        }

        renderer.render(scene, camera); 
        stats.end();
    };
    GameLoop(scene);
};
