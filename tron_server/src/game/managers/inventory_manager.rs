use std::collections::HashMap;

use crate::game::Inventory;

#[derive(Default, Debug)]
pub struct InventoryManager {
    db_connection: (),
    inventories: HashMap<String, Inventory>,
}
