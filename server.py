from dataclasses import dataclass
from threading import Thread
import unicodedata as ud
import json
import math
import time
from random import randint

import eventlet
from flask_socketio import SocketIO
from flask import Flask, send_from_directory, render_template

from ip import ip_address, port

async_mode = None
app = Flask(__name__, static_url_path='')
socketio = SocketIO(app, async_mode=async_mode)

latin_letters = {}


# TODO: rewrite this :D
def is_latin(uchr):
    try:
        return latin_letters[uchr]
    except KeyError:
        return latin_letters.setdefault(uchr, 'LATIN' in ud.name(uchr))


def only_roman_chars(unistr):
    return all(is_latin(uchr)
               for uchr in unistr
               if uchr.isalpha())


@dataclass
class Player:
    x: float
    y: float
    z: float

    player_name: str
    speed: float
    x_trail: list
    y_trail: list
    z_trail: list
    booster: int = 4

    dead: bool = False
    trail_size: int = 0
    heading: float = 0
    rotation: float = 0
    boost_time: int = 0
    toggle_controls_rotation: bool = True
    max_turn_angle: float = 0


@dataclass
class Point3d:
    x: float
    y: float
    z: float


# Vector structure for collisions
class Point:
    def __init__(self, a, b):
        if type(a) == Point and type(b) == Point:
            self.x = b.x - a.x
            self.y = b.y - a.y
        else:
            self.x = a
            self.y = b

    def dp(self, other):
        return self.x * other.x + other.y * self.y

    def cp(self, other):
        return self.x * other.y - other.x * self.y


class Game:
    def __init__(self) -> None:
        self.AllPlayers = dict()
        self.LastTrail = dict()
        self.boosters = list()
        self.LastTime = int(time.time() * 1000)  # Current time in milliseconds
        self.LastBoosters = int(time.time() * 1000)
        self.TurnSpeed = 0.05
        self.Speed = 0.03
        self.StartPositions = [[0, 0, 0], [100, 0, 0], [200, 0, 0], [300, 0, 0], [400, 0, 0], [500, 0, 0]]
        self.UsersNum = 0

    def playerReset(self):
        TheGrid.UsersNum = 0

        for key in TheGrid.AllPlayers.keys():
            elem = TheGrid.AllPlayers[key]
            elem.x_trail = []
            elem.y_trail = []
            elem.z_trail = []
            elem.trail_size = 0
            elem.rotation = 0
            elem.heading = 0
            elem.dead = False

            elem.x = TheGrid.StartPositions[TheGrid.UsersNum][0]
            elem.y = TheGrid.StartPositions[TheGrid.UsersNum][1]
            elem.z = TheGrid.StartPositions[TheGrid.UsersNum][2]

            TheGrid.UsersNum += 1

    # Collision check
    def collision_check(self):
        # TODO: Asymptotic of this algorithm seems very bad :(


        for player_key in self.AllPlayers.keys():  # Bike which we check
            for enemy_key in self.AllPlayers.keys():  # Bike for collisions
                for poly in range(self.AllPlayers[enemy_key].trail_size - 1):
                    player = self.AllPlayers[player_key]
                    enemy = self.AllPlayers[enemy_key]

                    try:
                        a = Point(player.x, player.z)  # Bike coords
                        b = Point(player.x + 6 * math.sin(player.heading),
                                  player.z + 6 * math.cos(player.heading))  # Second point

                        c = Point(enemy.x_trail[poly], enemy.z_trail[poly])  # Trail part 1
                        d = Point(enemy.x_trail[poly + 1], enemy.z_trail[poly + 1])  # Trail part 2

                        line1 = (Point(c, b).cp(Point(c, d)) > 0) == (Point(c, d).cp(Point(c, a)) > 0)
                        line2 = (Point(a, c).cp(Point(a, b)) > 0) == (Point(a, b).cp(Point(a, d)) > 0)

                        if line1 and line2:
                            parallel1 = max(a.x, b.x) >= min(c.x, d.x) and min(a.x, b.x) <= max(c.x, d.x)
                            parallel2 = max(a.y, b.y) >= min(c.y, d.y) and min(a.y, b.y) <= max(c.y, d.y)

                            if parallel1 and parallel2 and not player.dead:
                                player.dead = True

                                self.UsersNum -= 1
                                if TheGrid.UsersNum <= 1:
                                    TheGrid.playerReset()

                    except:
                        pass

        for bike_key in self.AllPlayers.keys():
            try:
                dx = abs(self.LastTrail[bike_key].x - self.AllPlayers[bike_key].x)
                dz = abs(self.LastTrail[bike_key].z - self.AllPlayers[bike_key].z)

                if dx * dx + dz * dz > 50:
                    self.AllPlayers[bike_key].x_trail.append(self.AllPlayers[bike_key].x)
                    self.AllPlayers[bike_key].y_trail.append(self.AllPlayers[bike_key].y)
                    self.AllPlayers[bike_key].z_trail.append(self.AllPlayers[bike_key].z)
                    self.AllPlayers[bike_key].trail_size += 1

                    self.LastTrail[bike_key].x = self.AllPlayers[bike_key].x
                    self.LastTrail[bike_key].z = self.AllPlayers[bike_key].z
            except:
                pass

        for bike in self.AllPlayers.keys():
            for i in range(len(self.boosters)):
                dx = self.boosters[i].x - self.AllPlayers[bike_key].x
                dz = self.boosters[i].z - self.AllPlayers[bike_key].z
                r = 4
                if math.sqrt(dx * dx + dz * dz) <= r:
                    self.AllPlayers[bike_key].booster += 1
                    self.boosters.pop(i)
                    converted = []
                    for i in self.boosters:
                        converted.append({"x": i.x, "y": i.y, "z": i.z })
                    socketio.emit('booster', json.dumps(converted))
                    break



    # Compute movements of all bikes in since last calculation
    def update(self):
        current_time = int(time.time() * 1000)  # Current time in milliseconds
        for bike_key in self.AllPlayers.keys():
            if self.AllPlayers[bike_key].dead:
                continue

            if self.AllPlayers[bike_key].boost_time <= 0:
                self.AllPlayers[bike_key].speed = TheGrid.Speed
            else:
                self.AllPlayers[bike_key].boost_time -= (current_time - self.LastTime)

            if self.AllPlayers[bike_key].max_turn_angle > 0:
                self.AllPlayers[bike_key].rotation = min(self.AllPlayers[bike_key].rotation + 0.02,
                                                         self.AllPlayers[bike_key].max_turn_angle)
            else:
                self.AllPlayers[bike_key].rotation = max(self.AllPlayers[bike_key].rotation - 0.02,
                                                         self.AllPlayers[bike_key].max_turn_angle)

            self.AllPlayers[bike_key].heading += (current_time - self.LastTime) * self.AllPlayers[
                bike_key].rotation * 0.001
            speed = (current_time - self.LastTime) * self.AllPlayers[bike_key].speed

            self.AllPlayers[bike_key].x += speed * math.sin(self.AllPlayers[bike_key].heading)
            self.AllPlayers[bike_key].z += speed * math.cos(self.AllPlayers[bike_key].heading)

        if current_time - self.LastBoosters > (10 * 1000) and len(self.boosters) < 10 and self.UsersNum:
            for i in range(min(3, 10 - len(self.boosters))):
                r = 1000
                self.boosters.append(Point3d(randint(-r, r), 1, randint(-r, r)))
            converted = []

            for i in self.boosters:
                converted.append({"x": i.x, "y": i.y, "z": i.z })

            socketio.emit('booster', json.dumps(converted))
            self.LastBoosters = current_time
        self.LastTime = current_time


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
    if not only_roman_chars(username):
        return '{"status": "", "error": "true"}'

    return ['{"status": "false", "error": "false"}', '{"status": "true", "error": "false"}'][
        username in TheGrid.AllPlayers.keys()]


@socketio.on('keyup')
def up(data):
    username = data['user']
    try:
        if data['key'] == 65:  # A
            TheGrid.AllPlayers[username].max_turn_angle = -0.0001
        elif data['key'] == 68:  # D
            TheGrid.AllPlayers[username].max_turn_angle = 0.0001
    except:
        pass


@socketio.on('keydown')
def down(data):
    username = data['user']
    try:
        if data['key'] == 65:  # A
            TheGrid.AllPlayers[username].max_turn_angle = 0.7
        elif data['key'] == 68:  # D
            TheGrid.AllPlayers[username].max_turn_angle = -0.7
        elif data['key'] == 16:  # Shift
            TheGrid.AllPlayers[username].speed = TheGrid.Speed * 3
            TheGrid.AllPlayers[username].boost_time = 1000 * TheGrid.AllPlayers[username].booster
            TheGrid.AllPlayers[username].booster = 0
        elif data['key'] == 67:  # C
            TheGrid.AllPlayers[username].toggle_controls_rotation = not TheGrid.AllPlayers[
                username].toggle_controls_rotation
    except:
        pass


@socketio.on('message')
def handle_message(data):
    print('received message: ' + data)


# When user chooses a name he submits his final name and we add him to the table
@socketio.on('add_user')
def add(username):
    print('New user')
    if username not in TheGrid.AllPlayers.keys():
        if len(TheGrid.AllPlayers) == 1:
            TheGrid.playerReset()

        TheGrid.LastTrail[username] = Point3d(0, 0, 0)
        start_position = TheGrid.StartPositions[TheGrid.UsersNum]
        TheGrid.AllPlayers[username] = Player(start_position[0], start_position[1], start_position[2],
                                              username, TheGrid.Speed, [], [], [])
        TheGrid.UsersNum += 1


@socketio.on('remove_user')
def remove_user(username):
    print('remove_user')
    try:
        del TheGrid.AllPlayers[username]
    except:
        pass


# We start a parallel thread for game logics
def game_loop(name):
    while True:
        TheGrid.update()

        # Convert to JSON
        converted = dict()
        for player in TheGrid.AllPlayers.items():
            converted[player[0]] = {'x': player[1].x, 'y': player[1].y, 'z': player[1].z,
                                    'heading': player[1].heading, 'controls': player[1].toggle_controls_rotation,
                                    'rotation': player[1].rotation, 'status': player[1].dead}

        if len(TheGrid.AllPlayers) != 0:
            socketio.emit('update', json.dumps(converted))

        

        time.sleep(0.01)


# Second parallel thread for collision checks (They are much less frequent)
def collisions(name):
    while True:
        TheGrid.collision_check()
        time.sleep(0.1)


if __name__ == "__main__":
    TheGrid = Game()
    eventlet.monkey_patch()

    x = Thread(target=game_loop, args=(1,))
    x.start()

    y = Thread(target=collisions, args=(1,))
    y.start()

    socketio.run(app, host=ip_address, port=port)
