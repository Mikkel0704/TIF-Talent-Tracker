import os, sys, subprocess, cv2, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from maske import Maske
src, tider, bredde = sys.argv[1], [float(x) for x in sys.argv[2].split(",")], int(sys.argv[3])
rammer = []
for t in tider:
    r = subprocess.run(["ffmpeg","-loglevel","error","-ss",str(t),"-i",src,"-frames:v","1","-vf",f"scale={bredde}:-2","-f","image2pipe","-vcodec","png","-"], capture_output=True)
    rammer.append(cv2.imdecode(np.frombuffer(r.stdout, np.uint8), cv2.IMREAD_COLOR))
for model in (1,):
    m = Maske(model=model, hele_billedet=bool(os.environ.get("HELE")), bold_graense=float(os.environ.get("GRAENSE", "0.62")), kun_en_person=bool(os.environ.get("EN"))); raekke = []
    for f in rammer:
        m.forrige = None; m.sidste_bold = None
        mask, p, b = m.hent(f, glat=False)
        vis = f.copy(); vis[..., 2] = np.clip(vis[..., 2] + 120 * p, 0, 255); vis[..., 1] = np.clip(vis[..., 1] + 120 * b, 0, 255)
        raekke.append(vis)
    vis_b = int(sys.argv[4]) if len(sys.argv) > 4 else 200
    raekke = [cv2.resize(x, (vis_b, x.shape[0] * vis_b // x.shape[1]), interpolation=cv2.INTER_AREA) for x in raekke]
    cv2.imwrite(f"stills/maske_model{model}.png", np.hstack(raekke))
print("ok")
