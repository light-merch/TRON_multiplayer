from dataclasses import dataclass, field
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
    player_name: str
    current_vehicle: int

    x: float = 0
    y: float = 0
    z: float = 0
    move_delta: list = field(default_factory=list)
    heading: float = 0

    dead: bool = False
    score: int = 0
    last_seen = None


# Player structure
@dataclass
class Lightcycle:
    x: float
    y: float
    z: float

    lightcycle_id: int

    speed: float
    heading: float
    last_heading: float
    x_trail: list = field(default_factory=list)
    y_trail: list = field(default_factory=list)
    z_trail: list = field(default_factory=list)

    is_seated = True
    lightcycle_name: str = "Encom 787"  # Just the title
    stop: bool = False
    booster: int = 0
    trail_size: int = 0
    rotation: float = 0
    boost_time: int = 0
    toggle_controls_rotation: bool = True

    reset: bool = True
    max_turn_angle: float = 0
    last_collision_check = None


# Main class for all game functions
class Game:
    def __init__(self) -> None:
        self.AllPlayers = dict()  # Dict to store all players (keys - usernames)
        self.AllVehicles = list()  # List to store all vehicles
        self.LastTrail = dict()
        self.boosters = list()
        self.LastTime = int(time.time() * 1000)  # Current time in milliseconds
        self.LastBoosters = int(time.time() * 1000)

        self.TurnSpeed = 0.005
        self.TurnMultiplier = 0.2
        self.Speed = 0.07
        self.StartPositions = [0, 180, 90, 270, 45, 225, 135, 315, 0, 200, 110, 290, 340, 160, 70, 250, 225, 320]
        self.UsersNum = 0

    def player_reset(self):
        socketio.emit('clear')
        TheGrid.UsersNum = 0

        for key in self.AllPlayers.keys():
            id = self.AllPlayers[key].current_vehicle
            self.AllPlayers[key].move_delta = [0, 0, 0]

            elem = self.AllVehicles[id]

            elem.last_collision_check = None
            elem.x_trail = []
            elem.y_trail = []
            elem.z_trail = []
            elem.trail_size = 0
            elem.rotation = 0
            self.AllPlayers[key].dead = False

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
            if self.AllPlayers[player_key].current_vehicle == None: continue

            for enemy_key in self.AllPlayers.keys():  # Bike for collisions
                if self.AllPlayers[enemy_key].current_vehicle == None: continue

                player = self.AllVehicles[self.AllPlayers[player_key].current_vehicle]
                enemy = self.AllVehicles[self.AllPlayers[enemy_key].current_vehicle]

                for poly in range(enemy.trail_size - 1):
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

                                if parallel1 and parallel2 and not self.AllPlayers[player_key].dead:
                                    self.AllPlayers[player_key].dead = True
                                    if player_key != enemy_key:
                                        self.AllPlayers[enemy_key].score += 1
                                    self.UsersNum -= 1
                                    if TheGrid.UsersNum <= 1:
                                        TheGrid.player_reset()

                    except:
                        pass

            player.last_collision_check = Point(player.x + 1 * math.sin(player.heading),
                                      player.z + 1 * math.cos(player.heading))


        for bike_key in self.AllPlayers.keys():
            try:
                id = self.AllPlayers[bike_key].current_vehicle
                dx = abs(self.LastTrail[bike_key].x - self.AllVehicles[id].x)
                dz = abs(self.LastTrail[bike_key].z - self.AllVehicles[id].z)

                if dx * dx + dz * dz > 50:
                    self.AllVehicles[id].x_trail.append(self.AllVehicles[id].x)
                    self.AllVehicles[id].y_trail.append(self.AllVehicles[id].y)
                    self.AllVehicles[id].z_trail.append(self.AllVehicles[id].z)
                    self.AllVehicles[id].trail_size += 1

                    self.LastTrail[bike_key].x = self.AllVehicles[id].x
                    self.LastTrail[bike_key].z = self.AllVehicles[id].z
            except:
                pass

        for id in range(len(self.AllVehicles)):
            for boosterInd in range(len(self.boosters)):
                dx = self.boosters[boosterInd].x - self.AllVehicles[id].x
                dz = self.boosters[boosterInd].z - self.AllVehicles[id].z
                if math.sqrt(dx * dx + dz * dz) <= 8 and self.AllVehicles[id].booster <= 8:
                    self.AllVehicles[id].booster += 1
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
            id = self.AllPlayers[bike_key].current_vehicle

            if id == None:
                # Update player character
                self.AllPlayers[bike_key].x += self.AllPlayers[bike_key].move_delta[0]
                self.AllPlayers[bike_key].y += self.AllPlayers[bike_key].move_delta[1]

                continue


            if self.AllVehicles[id].stop:
                continue

            # Out of borders
            if abs(self.AllVehicles[id].x) > 500 or abs(self.AllVehicles[id].z) > 800:
                self.AllVehicles[id].dead = True
                self.UsersNum -= 1
                if self.UsersNum <= 1:
                    self.player_reset()

            if self.AllPlayers[bike_key].dead:
                continue

            if self.AllVehicles[id].boost_time <= 0:
                # Reset player speed to normal
                self.AllVehicles[id].speed = min(TheGrid.Speed, self.AllVehicles[id].speed + 0.01)
            else:
                # Update boost time
                self.AllVehicles[id].boost_time -= (current_time - self.LastTime)
                self.AllVehicles[id].speed = min(TheGrid.Speed * 3, self.AllVehicles[id].speed + 0.01)

            # Bike vertical rotation
            if self.AllVehicles[id].reset:
                # Reset to vertical state
                if self.AllVehicles[id].rotation > 0:
                    self.AllVehicles[id].rotation = max(self.AllVehicles[id].rotation - 0.03,
                                                             self.AllVehicles[id].max_turn_angle)
                else:
                    self.AllVehicles[id].rotation = min(self.AllVehicles[id].rotation + 0.03,
                                                             self.AllVehicles[id].max_turn_angle)
            else:
                # Slowly turn
                if self.AllVehicles[id].max_turn_angle > 0:
                    # Right turn
                    self.AllVehicles[id].rotation = min(self.AllVehicles[id].rotation + 0.02,
                                                             self.AllVehicles[id].max_turn_angle)
                else:
                    # Left turn
                    self.AllVehicles[id].rotation = max(self.AllVehicles[id].rotation - 0.02,
                                                             self.AllVehicles[id].max_turn_angle)

            # Update heading (heading is updated through bike.rotation)
            self.AllVehicles[id].heading += (current_time - self.LastTime) * self.AllVehicles[
                id].rotation * self.TurnSpeed
            speed = (current_time - self.LastTime) * self.AllVehicles[id].speed
            self.AllVehicles[id].speed = max(0, self.AllVehicles[id].speed - abs(self.AllVehicles[id].heading - self.AllVehicles[id].last_heading) * self.TurnMultiplier)

            self.AllVehicles[id].x += speed * math.sin(self.AllVehicles[id].heading)
            self.AllVehicles[id].z += speed * math.cos(self.AllVehicles[id].heading)
            self.AllVehicles[id].last_heading = self.AllVehicles[id].heading

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
        if TheGrid.AllPlayers[username].current_vehicle == None:
            if data['key'] == 65:  # A
                TheGrid.AllPlayers[username].move_delta = [0, 0, 0]

            elif data['key'] == 68:  # D
                TheGrid.AllPlayers[username].move_delta = [0, 0, 0]

        else:
            if data['key'] == 65 or data['key'] == 68:  # A or D
                id = TheGrid.AllPlayers[username].current_vehicle
                TheGrid.AllVehicles[id].max_turn_angle = 0
                TheGrid.AllVehicles[id].reset = True
    except:
        pass


@socketio.on('keydown')
def down(data):
    username = data['user']

    id = TheGrid.AllPlayers[username].current_vehicle
    if id == None:
        if data['key'] == 65:  # A
            TheGrid.AllPlayers[username].move_delta = [0.2, 0, 0]
        elif data['key'] == 68:  # D
            TheGrid.AllPlayers[username].move_delta = [-0.2, 0, 0]
        if data['key'] == 87:  # W
            TheGrid.AllPlayers[username].move_delta = [0, 0, 2]
        elif data['key'] == 83:  # S
            TheGrid.AllPlayers[username].move_delta = [0, 0, -2]

    else:
        if data["key"] == 70:  # F
            TheGrid.AllVehicles[id].stop = True

            TheGrid.AllPlayers[username].current_vehicle = None
            TheGrid.AllPlayers[username].x = TheGrid.AllVehicles[id].x
            TheGrid.AllPlayers[username].y = TheGrid.AllVehicles[id].y
            TheGrid.AllPlayers[username].z = TheGrid.AllVehicles[id].z

            socketio.emit("exit_bike")

        elif data['key'] == 65:  # A
            TheGrid.AllVehicles[id].max_turn_angle = 0.7
            TheGrid.AllVehicles[id].reset = False
        elif data['key'] == 68:  # D
            TheGrid.AllVehicles[id].max_turn_angle = -0.7
            TheGrid.AllVehicles[id].reset = False
        elif data['key'] == 16:  # Shift
            TheGrid.AllVehicles[id].speed = TheGrid.Speed * 3
            TheGrid.AllVehicles[id].boost_time = 2000 * TheGrid.AllVehicles[id].booster
            TheGrid.AllVehicles[id].booster = 0
        elif data['key'] == 67:  # C
            TheGrid.AllVehicles[id][username].toggle_controls_rotation = not TheGrid.AllVehicles[
                id].toggle_controls_rotation


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

        id = len(TheGrid.AllVehicles)  # Generate id for the new bike
        TheGrid.AllVehicles.append(Lightcycle(SPAWN_R * math.cos(angle), 0, SPAWN_R * math.sin(angle), id,
            TheGrid.Speed, heading, heading))  # Create new bike

        TheGrid.AllPlayers[username] = Player(username, id)  # Initialise player on bike
        TheGrid.AllPlayers[username].move_delta = [0, 0, 0]

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

        # Append all vehicles with users riding them
        converted = {
            "players": {},
            "vehicles": {}
        }

        for player in TheGrid.AllPlayers.items():
            id = player[1].current_vehicle
            if id != None:
                converted["vehicles"][id] = {'x': TheGrid.AllVehicles[id].x,
                                        'y': TheGrid.AllVehicles[id].y,
                                        'z': TheGrid.AllVehicles[id].z,
                                        'heading': TheGrid.AllVehicles[id].heading,
                                        'controls': TheGrid.AllVehicles[id].toggle_controls_rotation,
                                        'rotation': TheGrid.AllVehicles[id].rotation,
                                        'status': player[1].dead,
                                        'boosters': TheGrid.AllVehicles[id].booster,
                                        'score': player[1].score,
                                        'empty_bike': False}

        # Append all empty vehicles
        for id, vehicle in enumerate(TheGrid.AllVehicles):
            if vehicle.is_seated == False:
                converted["vehicles"][id] = {'x': vehicle.x,
                                        'y': vehicle.y,
                                        'z': vehicle.z,
                                        'heading': vehicle.heading,
                                        'controls': vehicle.toggle_controls_rotation,
                                        'rotation': vehicle.rotation,
                                        'boosters': vehicle.booster,
                                        'empty_bike': True}


        # Send all player characters
        for player in TheGrid.AllPlayers.items():
            converted["players"][player[0]] = {'x': player[1].x,
                                    'y': player[1].y,
                                    'z': player[1].z,
                                    'heading': player[1].heading,
                                    'status': player[1].dead,
                                    'score': player[1].score,
                                    'current_vehicle': player[1].current_vehicle}


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

    TheGrid.AllVehicles.append(Lightcycle(10, 0, -20, 0, 0, 0, 0))
    TheGrid.AllVehicles[0].is_seated = False

    x = Thread(target=game_loop, args=(1,))
    x.start()

    y = Thread(target=collisions, args=(1,))
    y.start()

    z = Thread(target=send)
    z.start()
    
    print(f'Listening on http://{ip_address}:{port}')
    socketio.run(app, host=ip_address, port=port)
