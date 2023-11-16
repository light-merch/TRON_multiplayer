use std::{cell::RefCell, time::Duration};

// TheGrid related
#[derive(Default, Debug)]
pub struct User {
    uuid: uuid::Uuid,
    email: String,
    user_name: String,
    display_name: String,
    is_locked: bool,
    stats: Stats,
}

#[derive(Default, Debug)]
pub struct Stats {
    players_disintegrated: usize,
    times_disintegrated: usize,
    time_played: Duration,
}

#[derive(Default, Debug)]
pub struct Vehicle {
    model: VehicleModel,
    skin: Skin,
    modifiers: Vec<Modifier>,
}

#[derive(Default, Debug)]
pub enum VehicleModel {
    LightJet,
    LightCar,
    #[default]
    LightCycle,
    LightTank,
}

#[derive(Default, Debug)]
pub struct Skin {}

#[derive(Default, Debug)]
pub struct Modifier {}

#[derive(Default, Debug)]
pub struct Inventory {
    owner: RefCell<User>,
    vehicles: Vec<Vehicle>,
    actions: Vec<Action>,
    is_locked: bool,
}

#[derive(Debug)]
pub enum Action {
    Boost,
    Blast,
}
// Arena related

#[derive(Default, Debug)]
pub struct Player {
    current_state: PlayerState,
    linked_user: RefCell<User>,
    current_animation: RefCell<Animation>,
    inventory: RefCell<Inventory>,
}

#[derive(Default, Debug)]
enum PlayerState {
    InVehicle(RefCell<VehicleEntity>),
    OnFoot(RefCell<PlayerEntity>),
    #[default]
    None,
}

#[derive(Default, Debug)]
pub struct VehicleEntity {
    body: RefCell<PhyciscBody>,
    vehicle: Vehicle,
    players: Vec<RefCell<Player>>,
}

#[derive(Default, Debug)]
pub struct PlayerEntity {
    body: PhyciscBody,
}

#[derive(Default, Debug)]
pub struct Animation {}

pub type PhyciscBody = ();
