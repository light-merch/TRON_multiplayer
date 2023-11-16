use std::collections::HashMap;

use crate::game::User;

#[derive(Default, Debug)]
pub struct AccountManager {
    db_conn: (),
    users: HashMap<String, User>,
}
