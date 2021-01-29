import os
from dataclasses import dataclass
import json
from time import time

from flask import Flask, send_from_directory, render_template, request

app = Flask(__name__, static_url_path='')

@dataclass
class Player:
    player_name: str
    x: int
    y: int
    z: int


class Game():
    def __init__(self) -> None:
        self.AllPlayers = dict()
        self.LastTime = int(time() * 1000)

    def is_turn_correct(self):
        pass

    def do_turn(self):
        pass

    def get_game_info(self):
        pass


# Server part
@app.route('/')
def root():
    return render_template('main.html')


@app.route('/js/<path:path>')
def send_js(path):
    return send_from_directory('js', path)


@app.route('/get_data/<username>')
def get(username):
    currentTime = int(time() * 1000)
    for bike_key in TheGrid.AllPlayers.keys():
        TheGrid.AllPlayers[bike_key].z += (currentTime - TheGrid.LastTime) * 0.001

    TheGrid.LastTime = currentTime

    if username not in TheGrid.AllPlayers.keys():
        TheGrid.AllPlayers[username] = Player(username, 0, 0, 0)
    else:
        pass

    converted = dict()
    for player in TheGrid.AllPlayers.items():
        converted[player[0]] = {'x': player[1].x, 'y': player[1].y, 'z': player[1].z}

    return json.dumps(converted)



if __name__ == "__main__":
    TheGrid = Game()

    app.run()
