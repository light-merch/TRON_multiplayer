import os
from dataclasses import dataclass
import json

from flask import Flask, send_from_directory, render_template, request
from flask_socketio import SocketIO, emit


app = Flask(__name__, static_url_path='')
# socketio = SocketIO(app)


@dataclass
class Player:
    player_name: str
    x: int
    y: int
    z: int


class Game():
    def __init__(self) -> None:
        self.AllPlayers = dict()

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
    if username not in TheGrid.AllPlayers.keys():
        TheGrid.AllPlayers[username] = Player(username, 1, 1, 1)
    else:
        pass

    converted = dict()
    for player in TheGrid.AllPlayers.items():
        converted[player[0]] = {'x': player[1].x, 'y': player[1].y, 'z': player[1].z}
    return json.dumps(converted)



# @socketio.on('my event')
# def test_message(message):
#     emit('my response', {'data': message['data']})

# @socketio.on('connect')
# def test_connect():
#     print('Connected')
#
# @socketio.on('client_disconnecting')
# def disconnect_details(data):
#     print('Disconnect')
#     print(f'{data["username"]} user disconnected.')
#
# @socketio.on('disconnect')
# def test_disconnect():
#     print('Client disconnected')


if __name__ == "__main__":
    TheGrid = Game()
    app.run()
#     socketio.run(app)
