import json
import math
import time
import eventlet
from threading import Thread
from dataclasses import dataclass

from flask_socketio import SocketIO
from flask import Flask, send_from_directory, render_template

async_mode = None
app = Flask(__name__, static_url_path='')
app.config['SECRET_KEY'] = '#&=4t7TE'
socketio = SocketIO(app, async_mode=async_mode)


@dataclass
class Player:
    player_name: str
    speed: float
    x: float = 0
    y: float = 0
    z: float = 0
    heading: float = 0
    rotation: float = 0
    boost_time: int = 0
    toggle_controls_rotation: bool = True
    max_turn_angle: float = 0



class Game():
    def __init__(self) -> None:
        self.AllPlayers = dict()
        self.LastTime = int(time.time() * 1000) # Current time in milliseconds
        self.TurnSpeed = 0.05
        self.Speed = 0.03

    def collisionChecker(self):
        pass

    def update(self):
        currentTime = int(time.time() * 1000) # Current time in milliseconds
        for bike_key in self.AllPlayers.keys():
            if self.AllPlayers[bike_key].boost_time <= 0:
                self.AllPlayers[bike_key].speed = TheGrid.Speed
            else:
                self.AllPlayers[bike_key].boost_time -= (currentTime - self.LastTime)

            if self.AllPlayers[bike_key].max_turn_angle > 0:
                self.AllPlayers[bike_key].rotation = min(self.AllPlayers[bike_key].rotation + 0.02, self.AllPlayers[bike_key].max_turn_angle)
            else:
                self.AllPlayers[bike_key].rotation = max(self.AllPlayers[bike_key].rotation - 0.02, self.AllPlayers[bike_key].max_turn_angle)


            self.AllPlayers[bike_key].heading += (currentTime - self.LastTime) * self.AllPlayers[bike_key].rotation * 0.001

            speed = (currentTime - self.LastTime) * self.AllPlayers[bike_key].speed

            self.AllPlayers[bike_key].z += speed * math.cos(self.AllPlayers[bike_key].heading)
            self.AllPlayers[bike_key].x += speed * math.sin(self.AllPlayers[bike_key].heading)

        self.LastTime = currentTime



# Main page
@app.route('/')
def root():
    return render_template('main.html')


# Get files from server (etc. libs)
@app.route('/js/<path:path>')
def send_js(path):
    return send_from_directory('js', path)


# Used for checking a name entered by the user
@app.route('/check/<username>')
def check(username):
    return ['{"status": "false"}', '{"status": "true"}'][username in TheGrid.AllPlayers.keys()]


@socketio.on('keyup')
def up(data):
    username = data['user']
    if data['key'] == 65:  # A
        TheGrid.AllPlayers[username].max_turn_angle = -0.0001
    elif data['key'] == 68:  # D
        TheGrid.AllPlayers[username].max_turn_angle = 0.0001


@socketio.on('keydown')
def down(data):
    username = data['user']
    if data['key'] == 65:  # A
        TheGrid.AllPlayers[username].max_turn_angle = 0.7
    elif data['key'] == 68:  # D
        TheGrid.AllPlayers[username].max_turn_angle = -0.7
    elif data['key'] == 16:  # Shift
        TheGrid.AllPlayers[username].speed = TheGrid.Speed * 3
        TheGrid.AllPlayers[username].boost_time = 2000
    elif data['key'] == 67:  # C
        TheGrid.AllPlayers[username].toggle_controls_rotation = not TheGrid.AllPlayers[username].toggle_controls_rotation


@socketio.on('message')
def handle_message(data):
    print('received message: ' + data)


# When user chooses a name he submits his final name and we add him to the table
@socketio.on('add_user')
def add(username):
    print('New user')
    if username not in TheGrid.AllPlayers.keys():
        TheGrid.AllPlayers[username] = Player(username, TheGrid.Speed)



# We start a parrallel thread for game logics
def GameLoop(name):
    while True:
        TheGrid.update()

        # Convert to JSON
        converted = dict()
        for player in TheGrid.AllPlayers.items():
            converted[player[0]] = {'x': player[1].x, 'y': player[1].y, 'z': player[1].z,
             'heading': player[1].heading, 'controls': player[1].toggle_controls_rotation,
             'rotation': player[1].rotation}

        if len(TheGrid.AllPlayers) != 0:
            socketio.emit('update', json.dumps(converted))

        time.sleep(0.01)


if __name__ == "__main__":
    TheGrid = Game()
    eventlet.monkey_patch()

    x = Thread(target=GameLoop, args=(1,))
    x.start()

    socketio.run(app, port=5002)
