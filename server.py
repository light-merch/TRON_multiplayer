import os
from dataclasses import dataclass
import json
import math
from time import time

from flask import Flask, send_from_directory, render_template, request

app = Flask(__name__, static_url_path='')

@dataclass
class Player:
    player_name: str
    x: int
    y: int
    z: int
    heading: int
    speed: int
    boost_time: int
    toggle_controls_rotation: bool


class Game():
    def __init__(self) -> None:
        self.AllPlayers = dict()
        self.LastTime = int(time() * 1000) # Current time in milliseconds
        self.TurnAngle = 5 * (math.pi / 180) # Default is 5
        self.Speed = 0.03

    def collisionChecker(self):
        pass

    def update(self):
        currentTime = int(time() * 1000) # Current time in milliseconds
        for bike_key in self.AllPlayers.keys():
            if self.AllPlayers[bike_key].boost_time <= 0:
                self.AllPlayers[bike_key].speed = TheGrid.Speed
            else:
                self.AllPlayers[bike_key].boost_time -= (currentTime - self.LastTime)
            speed = (currentTime - self.LastTime) * self.AllPlayers[bike_key].speed
            self.AllPlayers[bike_key].z += speed * math.cos(self.AllPlayers[bike_key].heading)
            self.AllPlayers[bike_key].x += speed * math.sin(self.AllPlayers[bike_key].heading)

        self.LastTime = currentTime



# Server part
@app.route('/')
def root():
    return render_template('main.html')


@app.route('/js/<path:path>')
def send_js(path):
    return send_from_directory('js', path)


@app.route('/check/<username>')
def check(username):
    return ['{"status": "false"}', '{"status": "true"}'][username in TheGrid.AllPlayers.keys()]


@app.route('/send_data/<username>/<key_code>')
def send(username, key_code):
    TheGrid.update()

    if key_code == '65':  # A
        TheGrid.AllPlayers[username].heading += TheGrid.TurnAngle
    elif key_code == '68':  # D
        TheGrid.AllPlayers[username].heading -= TheGrid.TurnAngle
    elif key_code == '16':  # Shift
        TheGrid.AllPlayers[username].speed = TheGrid.Speed * 3
        TheGrid.AllPlayers[username].boost_time = 2000
    elif key_code == '67':  # C
        TheGrid.AllPlayers[username].toggle_controls_rotation = not TheGrid.AllPlayers[username].toggle_controls_rotation

    return '{"done": true}'


@app.route('/get_data/<username>')
def get(username):
    TheGrid.update()

    if username not in TheGrid.AllPlayers.keys():
        TheGrid.AllPlayers[username] = Player(username, 0, 0, 0, 0, TheGrid.Speed, 0, True)

    converted = dict()
    for player in TheGrid.AllPlayers.items():
        converted[player[0]] = {'x': player[1].x, 'y': player[1].y, 'z': player[1].z,
         'heading': player[1].heading, 'controls': player[1].toggle_controls_rotation}

    return json.dumps(converted)



if __name__ == "__main__":
    TheGrid = Game()
    app.run(port=5002)
