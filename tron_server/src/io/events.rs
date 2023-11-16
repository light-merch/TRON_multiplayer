use uuid::Uuid;

#[derive(Debug)]
pub struct InputEvent {
    player: Uuid,
    event: InputEventType,
}

#[derive(Debug, Default)]
pub enum InputEventType {
    // Connection (8)
    Connect,
    Disconnect,

    // Turn (8)
    VehicleLeft(f32),
    VehicleRight(f32),

    // Action (32)
    Boost,
    Blast,
    Mine,
    DiscThrow,

    // Vehicles (8)
    Enter,
    Exit,
    Explosion,

    // Walk (16)
    Forward(f32),
    Backward(f32),
    PlayerLeft(f32),
    PlayerRight(f32),
    Jump(f32),

    #[default]
    NoEvent,
}

pub fn decode_input_event(b: Vec<u8>) -> InputEventType {
    use InputEventType::*;
    let event_type: u8 = match b.get(0) {
        Some(v) => *v,
        None => return InputEventType::NoEvent,
    };
    let arg: f32 = match b[4..8].try_into() {
        Ok(b) => f32::from_ne_bytes(b),
        Err(_) => return InputEventType::NoEvent,
    };

    match event_type {
        // Connection
        0 => Connect,
        1 => Disconnect,

        // Turn
        8 => VehicleLeft(arg),
        9 => VehicleRight(arg),

        // Actions
        16 => Boost,
        17 => Blast,
        18 => Mine,
        19 => DiscThrow,

        // Vehicle
        48 => Enter,
        49 => Exit,
        50 => Explosion,

        // Walk
        56 => Forward(arg),
        57 => Backward(arg),
        58 => PlayerLeft(arg),
        59 => PlayerRight(arg),
        60 => Jump(arg),

        // Wrong event
        _ => InputEventType::NoEvent,
    }
}

pub enum OutputData {}
