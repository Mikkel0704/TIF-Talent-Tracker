"""Sloerer baggrund og omgivelser i en video, saa spiller og bold er skarpe. Fjerner lyden.
   python slor.py ind.mov ud.mp4"""
import os, sys, subprocess, time, cv2, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from maske import Maske

ind, ud = sys.argv[1], sys.argv[2]
W, H = 1080, 1920            # hoejformat, som optaget; ffmpeg drejer billedet efter filens rotationsmaerke
SLOR = 7.0                   # styrken af sloeringen, maalt paa et billede, der er 1/4 saa stort
fps = subprocess.run(["ffprobe","-v","error","-select_streams","v:0","-show_entries","stream=r_frame_rate","-of","csv=p=0",ind],
                     capture_output=True, text=True).stdout.strip().strip(",")
laes = subprocess.Popen(["ffmpeg","-loglevel","error","-i",ind,"-vf",f"scale={W}:{H}","-f","rawvideo","-pix_fmt","bgr24","-"], stdout=subprocess.PIPE)
skriv = subprocess.Popen(["ffmpeg","-loglevel","error","-y","-f","rawvideo","-pix_fmt","bgr24","-s",f"{W}x{H}","-r",fps,"-i","-",
    "-an",                                                     # ingen lyd
    "-c:v","libx264","-preset","medium","-crf","21","-pix_fmt","yuv420p","-colorspace","bt709","-color_primaries","bt709","-color_trc","bt709",
    "-movflags","+faststart",ud], stdin=subprocess.PIPE)
m = Maske(hele_billedet=bool(os.environ.get("HELE")), bold_graense=float(os.environ.get("GRAENSE", "0.62")), kun_en_person=bool(os.environ.get("EN")))
PW = 540                     # maske og personmodel koeres paa et mindre billede - det er hurtigere og lige saa godt
n, t0 = 0, time.time()
while True:
    buf = laes.stdout.read(W * H * 3)
    if len(buf) < W * H * 3: break
    ramme = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
    lille = cv2.resize(ramme, (PW, PW * H // W), interpolation=cv2.INTER_AREA)
    maske, _, _ = m.hent(lille)
    maske = cv2.resize(maske, (W, H), interpolation=cv2.INTER_LINEAR)[..., None]
    kvart = cv2.resize(ramme, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    kvart = cv2.GaussianBlur(kvart, (0, 0), SLOR)
    slort = cv2.resize(kvart, (W, H), interpolation=cv2.INTER_CUBIC)
    ud_ramme = (ramme * maske + slort * (1 - maske)).astype(np.uint8)
    skriv.stdin.write(ud_ramme.tobytes()); n += 1
    if n % 100 == 0: print(f"{n} billeder, {time.time()-t0:.0f}s", flush=True)
skriv.stdin.close(); skriv.wait(); laes.wait()
print(f"faerdig: {n} billeder paa {time.time()-t0:.0f}s")
