use std::net::{SocketAddr, SocketAddrV4};

use futures::{future, SinkExt, StreamExt, TryStreamExt};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::WebSocketStream;
use tungstenite::{Error, Message};

use crate::io::events;

pub async fn listen_for_clients(address: SocketAddrV4) {
    let server = match TcpListener::bind(address).await {
        Ok(l) => l,
        Err(e) => {
            println!("Failed to start server {}", e);
            return;
        }
    };

    loop {
        match server.accept().await {
            Ok((sock, addr)) => {
                println!("Incoming connection from: {:?}", addr);
                tokio::spawn(handle_connection(sock, addr));
            }
            Err(e) => println!("Can't get client: {:?}", e),
        }
    }
}

async fn handle_connection(sock: TcpStream, addr: SocketAddr) {
    let mut ws_stream = match tokio_tungstenite::accept_async(sock).await {
        Ok(ws) => {
            println!("Connection established: {}", addr);
            ws
        }
        Err(e) => {
            println!("Can't accept clint at {} {}", addr, e);
            return;
        }
    };

    match ws_stream.next().await {
        Some(msg) => {
            match msg {
                Ok(v) => {
                    match v {
                        Message::Text(s) => {
                            if s.is_empty() {
                                // Proceed as guest
                            } else if s.len() == 128 {
                                // Authenticate user
                            } else {
                                println!(
                                    "Can't initialize user from: {} Wrong token size: {}",
                                    addr, s
                                );
                                match ws_stream
                                    .send(Message::Text("Wrong token format".to_string()))
                                    .await
                                {
                                    Ok(()) => {
                                        println!("Message successfully sent. Closing connection");
                                        let _ = ws_stream.close(None).await;
                                    }
                                    Err(e) => println!(
                                        "Error accured while sending message to client: {}",
                                        e
                                    ),
                                };
                                return;
                            }
                        }
                        _ => {
                            println!("Can't initialize user from: {} Wrong initial packet", addr);
                            match ws_stream
                                .send(Message::Text("Wrong token format".to_string()))
                                .await
                            {
                                Ok(()) => {
                                    println!("Message successfully sent. Closing connection");
                                    let _ = ws_stream.close(None).await;
                                }
                                Err(e) => {
                                    println!("Error accured while sending message to client: {}", e)
                                }
                            };
                            return;
                        }
                    }
                }
                Err(e) => {
                    println!("Can't initialize user from: {} Error: {}", addr, e);
                    return;
                }
            }
        }
        None => {
            println!("Can't initialize user from: {} Broken connection", addr);
            return;
        }
    }

    loop {
        match ws_stream.next().await {
            Some(r) => match r {
                Ok(msg) => match msg {
                    Message::Binary(bytes) => {
                        println!("Got event: {:?}", events::decode_input_event(bytes));
                    }
                    Message::Text(text) => {
                        println!("Got text: {}", text);
                        match ws_stream.send(Message::Text(text)).await {
                            Ok(_) => println!("Messege sent, successfully"),
                            Err(e) => println!("Got error while sending {}", e),
                        };
                    }
                    _ => {}
                },
                Err(err) => println!("Got error {}", err),
            },
            None => {
                println!("Connection closed {}", addr);
                return;
            }
        };
    }
}
