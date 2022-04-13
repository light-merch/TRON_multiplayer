from dataclasses import dataclass
from threading import Thread
import unicodedata as ud
import json
import math
import time
from datetime import datetime
from random import randint

import eventlet
from flask_socketio import SocketIO
from flask import Flask, send_from_directory, render_template

from ip import ip_address, port


async_mode = None
app = Flask(__name__, static_url_path='')
socketio = SocketIO(app, async_mode=async_mode)

latin_letters = {}
SPAWN_R = 400


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


# Player structure
@dataclass
class Player:
    x: float
    y: float
    z: float

    player_name: str
    speed: float
    heading: float
    last_heading: float
    x_trail: list
    y_trail: list
    z_trail: list

    booster: int = 0
    score: int = 0
    dead: bool = False
    trail_size: int = 0
    rotation: float = 0
    boost_time: int = 0
    toggle_controls_rotation: bool = True

    reset: bool = True
    max_turn_angle: float = 0
    last_collision_check = None
    last_seen = None


# Main class for all game functions
class Game:
    def __init__(self) -> None:
        self.AllPlayers = dict()
        self.LastTrail = dict()
        self.boosters = list()
        self.LastTime = int(time.time() * 1000)  # Current time in milliseconds
        self.LastBoosters = int(time.time() * 1000)
        self.TurnSpeed = 0.005
        self.TurnMultiplier = 0.2
        self.Speed = 0.07
        self.StartPositions = [0, 180, 90, 270, 45, 225, 135, 315, 0, 200, 110, 290, 340, 160, 70, 250, 225, 320]
        self.UsersNum = 0
        self.MaxBoosters = 5

    def player_reset(self):
        socketio.emit('clear')
        TheGrid.UsersNum = 0

        for key in self.AllPlayers.keys():
            elem = self.AllPlayers[key]

            elem.last_collision_check = None
            elem.x_trail = []
            elem.y_trail = []
            elem.z_trail = []
            elem.trail_size = 0
            elem.rotation = 0
            elem.dead = False
            elem.booster = 0
            elem.speed = self.Speed
            elem.boost_time = 0

            angle = TheGrid.StartPositions[TheGrid.UsersNum] * math.pi / 180
            a = Point(SPAWN_R * math.cos(angle), SPAWN_R * math.sin(angle))
            b = Point(0, 800)
            elem.heading = math.atan2(a.cp(b), a.dp(b)) - math.pi

            elem.y = 0
            elem.x = SPAWN_R * math.cos(angle)
            elem.z = SPAWN_R * math.sin(angle)

            TheGrid.UsersNum += 1

    # Collision check
    def collision_check(self):
        # TODO: Asymptotic of this algorithm seems very bad :(

        global player
        for player_key in self.AllPlayers.keys():  # Bike which we check
            for enemy_key in self.AllPlayers.keys():  # Bike for collisions
                player = self.AllPlayers[player_key]
                enemy = self.AllPlayers[enemy_key]

                for poly in range(self.AllPlayers[enemy_key].trail_size - 1):
                    try:
                        if player.last_collision_check is not None:
                            a = Point(player.last_collision_check.x, player.last_collision_check.y)  # Bike coords
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
                                    if player_key != enemy_key:
                                        enemy.score += 1
                                    self.UsersNum -= 1
                                    if TheGrid.UsersNum <= 1:
                                        TheGrid.player_reset()
                    except:
                        pass

            player.last_collision_check = Point(player.x + 1 * math.sin(player.heading),
                                      player.z + 1 * math.cos(player.heading))


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

        # Collision with boosters
        for bike in self.AllPlayers.keys():
            for boosterInd in range(len(self.boosters)):
                dx = self.boosters[boosterInd].x - self.AllPlayers[bike].x
                dz = self.boosters[boosterInd].z - self.AllPlayers[bike].z
                if math.sqrt(dx * dx + dz * dz) <= 8 and self.AllPlayers[bike].booster <= 8:
                    if self.AllPlayers[bike].booster < TheGrid.MaxBoosters:
                        self.AllPlayers[bike].booster += 1
                        self.boosters.pop(boosterInd)
                        converted = []
                        for booster in self.boosters:
                            converted.append({"x": booster.x, "y": booster.y, "z": booster.z })
                        socketio.emit('booster', json.dumps(converted))
                        break



    # Compute movements of all bikes since last calculation
    def update(self):
        current_time = int(time.time() * 1000)  # Current time in milliseconds
        for bike_key in self.AllPlayers.keys():  # Iterate over all players
            # Out of borders
            if abs(self.AllPlayers[bike_key].x) > 500 or abs(self.AllPlayers[bike_key].z) > 800:
                self.AllPlayers[bike_key].dead = True
                self.UsersNum -= 1
                if self.UsersNum <= 1:
                    self.player_reset()

            if self.AllPlayers[bike_key].dead:
                continue

            if self.AllPlayers[bike_key].boost_time <= 0:
                # Reset player speed to normal
                self.AllPlayers[bike_key].speed = min(TheGrid.Speed, self.AllPlayers[bike_key].speed + 0.01)
            else:
                # Update boost time
                self.AllPlayers[bike_key].boost_time -= (current_time - self.LastTime)
                self.AllPlayers[bike_key].speed = min(TheGrid.Speed * 3, self.AllPlayers[bike_key].speed + 0.01)

            # Bike vertical rotation
            if self.AllPlayers[bike_key].reset:
                # Reset to vertical state
                if self.AllPlayers[bike_key].rotation > 0:
                    self.AllPlayers[bike_key].rotation = max(self.AllPlayers[bike_key].rotation - 0.03,
                                                             self.AllPlayers[bike_key].max_turn_angle)
                else:
                    self.AllPlayers[bike_key].rotation = min(self.AllPlayers[bike_key].rotation + 0.03,
                                                             self.AllPlayers[bike_key].max_turn_angle)
            else:
                # Slowly turn
                if self.AllPlayers[bike_key].max_turn_angle > 0:
                    # Right turn
                    self.AllPlayers[bike_key].rotation = min(self.AllPlayers[bike_key].rotation + 0.02,
                                                             self.AllPlayers[bike_key].max_turn_angle)
                else:
                    # Left turn
                    self.AllPlayers[bike_key].rotation = max(self.AllPlayers[bike_key].rotation - 0.02,
                                                             self.AllPlayers[bike_key].max_turn_angle)

            # Update heading (heading is updated through bike.rotation)
            self.AllPlayers[bike_key].heading += (current_time - self.LastTime) * self.AllPlayers[
                bike_key].rotation * self.TurnSpeed
            speed = (current_time - self.LastTime) * self.AllPlayers[bike_key].speed
            self.AllPlayers[bike_key].speed = max(0, self.AllPlayers[bike_key].speed - abs(self.AllPlayers[bike_key].heading - self.AllPlayers[bike_key].last_heading) * self.TurnMultiplier)

            self.AllPlayers[bike_key].x += speed * math.sin(self.AllPlayers[bike_key].heading)
            self.AllPlayers[bike_key].z += speed * math.cos(self.AllPlayers[bike_key].heading)
            self.AllPlayers[bike_key].last_heading = self.AllPlayers[bike_key].heading

        # Create boosters
        if current_time - self.LastBoosters > (10000) and len(self.boosters) < 10 and self.UsersNum:
            for i in range(min(3, 10 - len(self.boosters))):
                # Field sizes
                rx = 500
                ry = 800
                self.boosters.append(Point3d(randint(-rx, rx), 1, randint(-ry, ry)))
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


# Get files from server (e.g. libs)
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


@socketio.on('pingserver')
def ping(name):
    TheGrid.AllPlayers[name].last_seen = int(time.time() * 1000)


@socketio.on('keyup')
def up(data):
    username = data['user']
    try:
        if data['key'] == 65 or data['key'] == 68:  # A or D
            TheGrid.AllPlayers[username].max_turn_angle = 0
            TheGrid.AllPlayers[username].reset = True
    except:
        pass


@socketio.on('keydown')
def down(data):
    username = data['user']
    try:
        if data["key"] == 70:  # F
            TheGrid.AllPlayers[username].dead = True
            socketio.emit("exit_bike")

        elif data['key'] == 65:  # A
            TheGrid.AllPlayers[username].max_turn_angle = 0.7
            TheGrid.AllPlayers[username].reset = False
        elif data['key'] == 68:  # D
            TheGrid.AllPlayers[username].max_turn_angle = -0.7
            TheGrid.AllPlayers[username].reset = False
        elif data['key'] == 16:  # Shift
            TheGrid.AllPlayers[username].speed = TheGrid.Speed * 3
            TheGrid.AllPlayers[username].boost_time = 2000 * TheGrid.AllPlayers[username].booster
            TheGrid.AllPlayers[username].booster = 0
        elif data['key'] == 67:  # C
            TheGrid.AllPlayers[username].toggle_controls_rotation = not TheGrid.AllPlayers[
                username].toggle_controls_rotation

    except Exception as e:
        print(e)



@socketio.on('message')
def handle_message(data):
    pass


# When user chooses a name he submits his final name and we add him to the table
@socketio.on('add_user')
def add(username, mobile):
    print(datetime.now(), "add_user")
    if username not in TheGrid.AllPlayers.keys():
        if len(TheGrid.AllPlayers) == 1:
            TheGrid.player_reset()

        TheGrid.LastTrail[username] = Point3d(0, 0, 0)
        angle = TheGrid.StartPositions[TheGrid.UsersNum] * math.pi / 180
        a = Point(SPAWN_R * math.cos(angle), SPAWN_R * math.sin(angle))
        b = Point(0, 800)

        heading = math.atan2(a.cp(b), a.dp(b)) - math.pi
        TheGrid.AllPlayers[username] = Player(SPAWN_R * math.cos(angle), 0, SPAWN_R * math.sin(angle),
                                              username, TheGrid.Speed, heading, heading, [], [], [])
        TheGrid.UsersNum += 1
        converted = []
        for booster in TheGrid.boosters:
            converted.append({"x": booster.x, "y": booster.y, "z": booster.z })
        socketio.emit('booster', json.dumps(converted))


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
            converted[player[0]] = {'x': player[1].x,
                                    'y': player[1].y,
                                    'z': player[1].z,
                                    'heading': player[1].heading,
                                    'controls': player[1].toggle_controls_rotation,
                                    'rotation': player[1].rotation,
                                    'status': player[1].dead,
                                    'boosters': player[1].booster,
                                    'score': player[1].score}

        if len(TheGrid.AllPlayers) != 0:
            socketio.emit('update', json.dumps(converted))

        time.sleep(0.01)  # Default 0.01


# Second parallel thread for collision checks (They are much less frequent)
def collisions(name):
    while True:
        TheGrid.collision_check()
        time.sleep(0.1)


def send():
    while True:
        for user in TheGrid.AllPlayers:
            if TheGrid.AllPlayers[user].last_seen != None and int(time.time() * 1000) - TheGrid.AllPlayers[user].last_seen >= 20000:
                del TheGrid.AllPlayers[user]
                print(f"User {user} deleted due to inactivity")
                break

        socketio.emit('pingclient')
        time.sleep(5)


if __name__ == "__main__":
    TheGrid = Game()
    eventlet.monkey_patch()

    x = Thread(target=game_loop, args=(1,))
    x.start()

    y = Thread(target=collisions, args=(1,))
    y.start()

    z = Thread(target=send)
    z.start()
    
    print(f'Listening on http://{ip_address}:{port}')
    socketio.run(app, host=ip_address, port=port)
