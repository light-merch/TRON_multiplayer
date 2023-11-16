use std::collections::HashMap;

use crate::game::Stats;

pub struct ArenaStartContext {
    
}

pub struct ArenaEndContext {
    stats: HashMap<String, Stats>,
}
