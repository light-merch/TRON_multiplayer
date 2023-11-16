use std::{
    net::{Ipv4Addr, SocketAddrV4},
    sync::atomic::{AtomicUsize, Ordering},
    thread,
};

use arena::Arena;
use game::*;

mod game;
mod io;

fn main() {
    let grid: Arena = Arena::default();
    let (event_queue, data_queue) = grid.get_queues();
    let builder = thread::Builder::new().name(format!("game-thread"));

    let game_handle = match builder.spawn(|| grid.game_loop()) {
        Ok(jh) => {
            println!("Spawned game thread successfully");
            jh
        }
        Err(e) => {
            println!("Can't start grid instance: {}", e);
            return;
        }
    };

    let addr = SocketAddrV4::new(Ipv4Addr::new(127, 0, 0, 1), 9001);

    let runtime_result = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .thread_name_fn(|| -> String {
            static ID: AtomicUsize = AtomicUsize::new(0);
            format!("comm-thread-{}", ID.fetch_add(1, Ordering::SeqCst))
        })
        .build();

    let runtime = match runtime_result {
        Ok(rt) => rt,
        Err(e) => {
            println!("Can't construct runtime: {}", e);
            return;
        }
    };

    runtime.block_on(io::listen_for_clients(addr));
    match game_handle.join() {
        Ok(_) => println!("Game finished. Exiting"),
        Err(_) => println!("Game can't be finished. Exiting"),
    };
}
