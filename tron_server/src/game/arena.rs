use std::collections::VecDeque;
use std::sync::Arc;
use std::sync::Mutex;
use std::thread::sleep;
use std::time::Duration;

use crate::io::*;
use crate::game::*;

pub type MtQueue<T> = Arc<Mutex<VecDeque<T>>>;

#[derive(Default, Debug)]
pub struct Arena {
    // Managers (Structs containing and managing game objects)
    player_manager: PlayerManager,
    animation_manager: AnimationManager,
    player_entity_manager: PlayerEntityManager,
    vehicle_entity_manager: VehicleEntityManager,
    physics_manager: PhysicsManager,
    // Service variables
    running: bool,
    iterations: usize,
    // IO queues
    input_queue: MtQueue<InputEvent>,
    output_queue: MtQueue<()>,
}

impl Arena {
    pub fn game_loop(mut self) {
        println!("Initializing game loop");
        self.running = true;

        println!("Entering game loop");
        while self.running {
            if let Err(_) = self.handle_events() {
                // since Err was returned queue mutex is poisoned
                // communication thread probably is dead no need to continue
                break;
            };
            self.update_physics();
            self.compute_logic();

            // Wait for next iteration
            sleep(Duration::from_millis(10));
            self.iterations += 1;
        }

        println!("Exiting game loop");
    }
    fn handle_events(&mut self) -> Result<(), ()> {
        // Try to acquire a queue lock
        let mut queue = match self.input_queue.lock() {
            Ok(g) => g,
            // Is lock is poisoned return err
            Err(_) => return Err(()),
        };

        // If queue is empty exit and procced next step
        if queue.is_empty() {
            return Ok(());
        }

        // Get all events and apply them
        println!("Got events:");
        while !queue.is_empty() {
            println!("{:?}", queue.pop_front());
        }

        // Return Ok since finished successfully
        Ok(())
    }
    fn update_physics(&mut self) {}
    fn compute_logic(&mut self) {}

    pub fn get_queues(&self) -> (MtQueue<InputEvent>, MtQueue<()>) {
        (self.input_queue.clone(), self.output_queue.clone())
    }
}
