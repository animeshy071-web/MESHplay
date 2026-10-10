// MESHplay — offline standalone Windows desktop runtime.
// Release builds hide the console window entirely.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    meshplay::run()
}
