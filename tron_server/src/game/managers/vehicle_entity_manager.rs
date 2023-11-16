use crate::game::VehicleEntity;

#[derive(Default, Debug)]
pub struct VehicleEntityManager {
    entities: Vec<VehicleEntity>,
}
