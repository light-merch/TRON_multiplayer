use crate::game::PlayerEntity;

#[derive(Default, Debug)]
pub struct PlayerEntityManager {
    entities: Vec<PlayerEntity>,
}
