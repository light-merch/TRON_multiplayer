// mod ws {
//     use warp::ws::WebSocket;
//     pub async fn client_connection(ws: WebSocket) {
//         println!("establishing client connection... {:?}", ws);
//     }
// }

// mod handlers {
//     use crate::{ws, Result};
//     use warp::Reply;
//     pub async fn ws_handler(ws: warp::ws::Ws) -> Result<impl Reply> {
//         println!("ws_handler");
//         Ok(ws.on_upgrade(move |socket| ws::client_connection(socket)))
//     }
// }

// use warp::{Filter, Rejection};
// type Result<T> = std::result::Result<T, Rejection>;

#![allow(dead_code)]

const SPAWN_R: f64 = 400.0;

use std::collections::HashMap;
use std::time::{SystemTime};
use rand::Rng;

#[derive(Debug)]
struct Point3d {
    x: f64,
    y: f64,
    z: f64
}

impl Point3d {
    // Create from floats
    fn new(x: f64, y: f64, z: f64) -> Point3d {
        Point3d {x, y, z}
    }
}

#[derive(Debug)]
struct Point {
    x: f64,
    y: f64
}


impl Point {
    // Create from floats
    fn new(x: f64, y: f64) -> Point {
        Point {x, y}
    }
    // Create from other Points
    fn from(a: &Point, b: &Point) -> Point {
        Point {x: a.x - b.x, y: a.y - b.y}
    }
    // dp
    fn dp(&self, other: &Point) -> f64 {
        self.x * other.x + self.y * other.y
    }
    // cp
    fn cp(&self, other: &Point) -> f64 {
        self.x * other.x - self.y * other.y
    }
}

#[derive(Debug)]
struct Player {
    x: f64,
    y: f64,
    z: f64,
    
    player_name: String,
    speed: f64,
    heading: f64,
    last_heading: f64,

    x_trail: Vec<f64>,
    y_trail: Vec<f64>,
    z_trail: Vec<f64>,
    booster: i64,
    score: i64,
    dead: bool,
    trail_size: i64,
    rotation: f64,
    boost_time: i64,
    toggle_controls_rotation: bool,

    reset: bool,
    max_turn_angle: f64,
    last_collision_check: Option<Point>,
    last_seen: i64
}

impl Player {
    fn new(
        x: f64, y: f64, z: f64, player_name: String,
        speed: f64, heading: f64, last_heading: f64
    ) -> Player {
        Player {
            x, y, z, player_name, speed, heading, last_heading,

            x_trail: Vec::new(),
            z_trail: Vec::new(),
            y_trail: Vec::new(),
            booster: 0,
            score: 0,
            dead: false,
            trail_size: 0,
            rotation: 0.0,
            boost_time: 0,
            toggle_controls_rotation: true,
            
            reset: true,
            max_turn_angle: 0.0,
            last_collision_check: None,
            last_seen: 0
        }
    }
}

#[derive(Debug)]
struct Game {
    all_players: HashMap<String, Player>,
    players_names: Vec<String>,
    last_trail: HashMap<String, Point3d>,
    boosters: Vec<Point3d>,
    last_time: i64,
    last_boosters: i64,
    turn_speed: f64,
    turn_multiplier: f64,
    speed: f64,
    start_positions: Vec<f64>,
    users_num: i64
}

impl Game {
    fn new() -> Game {
        Game {
            all_players: HashMap::new(),
            players_names: Vec::new(),
            last_trail: HashMap::new(),
            boosters: Vec::new(),
            last_time: SystemTime::now().elapsed().unwrap().as_millis() as i64,
            last_boosters: SystemTime::now().elapsed().unwrap().as_millis() as i64,
            turn_speed: 0.005,
            turn_multiplier: 0.2,
            speed: 0.07,
            start_positions: Vec::from([0.0, 180.0, 90.0, 270.0, 45.0, 225.0, 135.0, 315.0, 0.0, 200.0, 110.0, 290.0, 340.0, 160.0, 70.0, 250.0, 225.0, 320.0]),
            users_num: 0
        }
    }
    // create new player from name
    fn add_player(&mut self, name: String) {
        if !self.players_names.contains(&name) {
            if self.all_players.len() == 1 {
                self.reset_players();
            }
            self.players_names.push(name.clone());
            self.last_trail.insert(name.clone(), Point3d::new(0.0,0.0,0.0));

            let angle = self.start_positions[(self.users_num % self.start_positions.len() as i64) as usize] * std::f64::consts::PI / 180.0;

            let a = Point::new(SPAWN_R * angle.cos(), SPAWN_R * angle.sin());
            let b = Point::new(0.0, 800.0);

            let heading = a.cp(&b).atan2(a.dp(&b)) - std::f64::consts::PI;
            self.all_players.insert(name.clone(),Player::new(SPAWN_R * angle.cos(), 0.0, SPAWN_R * angle.sin(), name, self.speed, heading, heading));
            self.users_num += 1;
        }
    }
    // reset all players to start state
    fn reset_players(&mut self) {
        self.users_num = 0;
        for name in self.players_names.clone() {
            let player = self.all_players.get_mut(&name).unwrap();
            player.last_collision_check = None;
            player.x_trail = Vec::new();
            player.y_trail = Vec::new();
            player.z_trail = Vec::new();
            player.trail_size = 0;
            player.rotation = 0.0;
            player.dead = false;

            let angle = self.start_positions[self.users_num as usize] * std::f64::consts::PI / 180.0;
            let a = Point::new(SPAWN_R * angle.cos(), SPAWN_R * angle.sin());
            let b = Point::new(0.0, 800.0);
            player.heading = a.cp(&b).atan2(a.dp(&b)) - std::f64::consts::PI;

            player.x = SPAWN_R * angle.cos();
            player.y = 0.0;
            player.z = SPAWN_R * angle.sin();
            self.users_num += 1;
        }
    }
    // proceed collisions and trail creation
    fn collision_check(&mut self) {
        let mut should_reset = false;
        'player: for player_name in self.players_names.clone() {
            let mut player_score = 0;
            for enemy_name in self.players_names.clone() {
                let mut dead = false;
                let enemy = self.all_players.get(&enemy_name).unwrap();
                for poly in 0..enemy.trail_size - 1 {
                    if !enemy.last_collision_check.is_none() {
                        let player = self.all_players.get(&player_name).unwrap();

                        let a = Point::new(enemy.last_collision_check.as_ref().unwrap().x, enemy.last_collision_check.as_ref().unwrap().y);
                        let b = Point::new(enemy.x + 6.0 * enemy.heading.sin(), enemy.z + 6.0 * enemy.heading.cos());

                        let c = Point::new(player.x_trail[poly as usize], player.z_trail[poly as usize]);
                        let d = Point::new(player.x_trail[poly as usize], player.z_trail[poly as usize]);

                        let line1 = (Point::from(&c, &b).cp(&Point::from(&c, &d)) > 0.0) == (Point::from(&c, &d).cp(&Point::from(&c, &a)) > 0.0);
                        let line2 = (Point::from(&a, &c).cp(&Point::from(&a, &b)) > 0.0) == (Point::from(&a, &b).cp(&Point::from(&a, &d)) > 0.0);

                        if line1 && line2 {
                            let parallel1 = a.x.max(b.x) >= c.x.min(d.x) && a.x.min(b.x) <= c.x.max(d.x);
                            let parallel2 = a.y.max(b.y) >= c.y.min(d.y) && a.y.min(b.y) <= c.y.max(d.y);
                            
                            if parallel1 && parallel2 && !enemy.dead {
                                dead = true;
                                if enemy_name != player_name {
                                    player_score += 1;
                                }
                                self.users_num -= 1;
                                if self.users_num <= 1 {
                                    should_reset = true;
                                    break 'player;
                                }
                            }
                        }
                    }
                }
                let enemy = self.all_players.get_mut(&enemy_name).unwrap();
                enemy.dead = dead;
                enemy.last_collision_check = Some(Point::new(enemy.x + enemy.heading.sin(), enemy.z + enemy.heading.cos()))
            }
            let player = self.all_players.get_mut(&player_name).unwrap();
            player.score += player_score;
        }
        if should_reset {
            self.reset_players();
            return;
        }

        for bike_key in self.players_names.clone() {
            let bike = self.all_players.get_mut(&bike_key).unwrap();
            let trail = self.last_trail.get_mut(&bike_key).unwrap();

            let dx = (trail.x - bike.x).abs();
            let dz = (trail.z - bike.z).abs();
            if dx * dx + dz * dz > 50.0 {
                bike.x_trail.push(bike.x);
                bike.y_trail.push(bike.y);
                bike.z_trail.push(bike.z);
                bike.trail_size += 1;

                trail.x = bike.x;
                trail.z = bike.z;
            }
        }

        for bike in self.players_names.clone() {
            for booster_ind in 0..self.boosters.len() {
                let dx = (self.boosters[booster_ind].x - self.all_players[&bike].x).abs();
                let dz = (self.boosters[booster_ind].z - self.all_players[&bike].z).abs();
                if (dx * dx + dz * dz).sqrt() <= 8.0 && self.all_players[&bike].booster <= 8 {
                    self.all_players.get_mut(&bike).unwrap().booster += 1;
                    self.boosters.remove(booster_ind);
                    // break;
                }
            }
        }
    }

    fn update(&mut self) {
        let current_time = SystemTime::now().elapsed().unwrap().as_millis() as i64;
        let mut should_reset = false;
        'bike: for bike_key in self.players_names.clone() {
            let bike = self.all_players.get_mut(&bike_key).unwrap();

            if bike.x.abs() > 500.0 || bike.y.abs() > 800.0 {
                bike.dead = true;
                self.users_num -= 1;
                if self.users_num <= 1 {
                    should_reset = true;
                    break 'bike;
                }
            }

            if bike.dead {
                continue;
            }

            if bike.boost_time <= 0 {
                bike.speed = self.speed.min(bike.speed + 0.01);
            } else {
                bike.boost_time -= current_time - self.last_time;
                bike.speed = (self.speed * 3.0).min(bike.speed + 0.01);
            }

            if bike.reset {
                if bike.rotation > 0.0 {
                    bike.rotation = bike.max_turn_angle.max(bike.rotation - 0.03);
                } else {
                    bike.rotation = bike.max_turn_angle.max(bike.rotation + 0.03);
                }
            } else {
                if bike.max_turn_angle > 0.0 {
                    bike.rotation = bike.max_turn_angle.max(bike.rotation + 0.02);
                } else {
                    bike.rotation = bike.max_turn_angle.max(bike.rotation - 0.02);
                }
            }
            bike.heading += (current_time - self.last_time) as f64 * bike.rotation * self.turn_speed;
            println!("{}", bike.speed);
            let speed = (current_time - self.last_time) as f64 * bike.speed;
            bike.speed = (bike.speed - (bike.heading - bike.last_heading).abs() * self.turn_multiplier).max(0.0);

            bike.x += speed * bike.heading.sin();
            bike.z += speed * bike.heading.cos();
            bike.last_heading = bike.heading;
        }
        if should_reset {
            self.reset_players();
        }

        if current_time - self.last_boosters > 10000 && self.boosters.len() < 10 && self.users_num > 0 {
            for _ in 0..3.min(10 - self.boosters.len()) {
                let radx = 500;
                let rady = 800;
                let ranx = rand::thread_rng().gen_range(-radx as f64..radx as f64);
                let rany = rand::thread_rng().gen_range(-rady as f64..rady as f64);
                self.boosters.push(Point3d::new(ranx, 1.0, rany));
            }
            self.last_boosters = current_time;
        }
        self.last_time = current_time;
    }
}

fn game_loop(game: &mut Game) {
    loop {
        let start = SystemTime::now();
        game.update();
        game.collision_check();
        let elapsed = start.elapsed().unwrap();
        println!("game updates + collisions check per second: {} with {}", 1.0 / elapsed.as_secs_f64(), game.all_players[&"newplayer".to_string()].trail_size);
        // game.senddata();
    }
}

fn main() {
    let mut the_grid: Game = Game::new();
    the_grid.add_player(String::from("newplayer"));
    for i in 0..0 {
        the_grid.add_player(i.to_string());
    }
    game_loop(&mut the_grid);
    // println!("{:#?}", the_grid);
}