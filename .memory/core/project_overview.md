# Neuron Impulse Conduction Simulator

## Overview
An interactive web-based educational simulation that visually demonstrates and compares the speed difference between Continuous Conduction (in unmyelinated neurons) and Saltatory Conduction (in myelinated neurons).

## Technology Stack
- **Languages:** HTML5, CSS3, Vanilla JavaScript (ES6+)
- **Rendering:** HTML5 Canvas API (2D Context)
- **Styling:** CSS Variables, Flexbox, Animations
- **No external dependencies** (Single-file application)

## Key Features
- **Dual Visualization Tracks:** 
    - Unmyelinated axon (simple tube, slow continuous movement)
    - Myelinated axon (myelin sheath segments + Nodes of Ranvier, fast "jumping" movement)
- **Real-time Metrics:** Millisecond timers for each track
- **Dynamic Calculation:** Automatically calculates and displays the speed multiplier (e.g., "5.2x faster") upon completion
- **Visual Effects:** 
    - Gradient fills for 3D appearance of axons
    - Glow effects for signal propagation
    - Animated transitions

## Architecture
- **State Management:** Simple global state variables (`isRunning`, `unmyelinatedPos`, `myelinatedPos`)
- **Animation Loop:** Uses `requestAnimationFrame` for smooth rendering
- **Responsiveness:** Auto-resizing canvas via `resizeCanvases()` function
- **Configuration:** Centralized `CONFIG` object for easy tuning of speed, colors, and dimensions