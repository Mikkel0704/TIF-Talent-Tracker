#!/bin/bash
# Maskeark for én plads: 7 billeder med personen (roed) og bolden (groen) markeret.
cd "$(dirname "$0")"
s=$1; d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 original/$s.mov)
tider=$(python3 -c "d=$d; print(','.join(f'{d*f:.2f}' for f in (0.05,0.2,0.35,0.5,0.65,0.8,0.95)))")
./venv/bin/python proev.py original/$s.mov $tider 540 200 >/dev/null 2>&1 && mv stills/maske_model1.png stills/ark_$s.png && echo "ark_$s.png ($d s)"
