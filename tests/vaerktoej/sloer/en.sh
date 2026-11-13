#!/bin/bash
# Renderer én plads, kontrollerer filen og laegger den op.   en.sh f_x
set -e
cd "$(dirname "$0")"
s=$1
if [ -z "$SPRING" ]; then ./venv/bin/python slor.py original/$s.mov ud/$s.mp4 2>&1 | grep -E "^faerdig" || { echo "$s: rendering fejlede"; exit 1; }; fi
spor=$(ffprobe -v error -show_entries stream=codec_type -of csv=p=0 ud/$s.mp4 | sort | uniq -c | tr -s ' ' | tr '\n' ';')
nf_ind=$(ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_read_packets -of csv=p=0 original/$s.mov | tr -d ",")
nf_ud=$(ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_read_packets -of csv=p=0 ud/$s.mp4 | tr -d ",")
d_ind=$(ffprobe -v error -select_streams v:0 -show_entries stream=duration -of csv=p=0 original/$s.mov | tr -d ",")
d_ud=$(ffprobe -v error -show_entries format=duration -of csv=p=0 ud/$s.mp4 | tr -d ",")
st=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 ud/$s.mp4 | tr -d ",")
echo "$s: spor [$spor] billeder $nf_ind -> $nf_ud | laengde $d_ind -> $d_ud | $st | $(du -m ud/$s.mp4 | cut -f1) MB"
[ "$spor" = " 1 video;" ] || { echo "$s: FORKERTE SPOR - ikke lagt op"; exit 1; }
[ "$nf_ind" = "$nf_ud" ] || { echo "$s: ANTAL BILLEDER AFVIGER - ikke lagt op"; exit 1; }
node bytt.cjs $s ud/$s.mp4 2>&1 | grep -v -E "fromJSON|credentials. option|MaxListeners|trace-warnings"
