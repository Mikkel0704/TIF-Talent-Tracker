"""Finder spilleren og bolden i et billede og returnerer en maske (1 = skarp, 0 = sløret).
Spilleren findes med MediaPipes personmodel. Bolden findes paa FARVEN: gulv, vaeg og tøj er
naesten graa, bolden er det eneste staerkt farvede i den nederste del af billedet.
"""
import cv2, numpy as np, mediapipe as mp

class Maske:
    def __init__(self, model=1, bold_graense=0.62, mætning=70, hele_billedet=False, kun_en_person=False):
        self.seg = mp.solutions.selfie_segmentation.SelfieSegmentation(model_selection=model)
        self.bold_graense = bold_graense   # bolden søges kun under denne andel af billedets højde
        self.maetning = mætning
        self.forrige = None
        self.kun_en_person = kun_en_person
        self.sidste_bold, self.mistet, self.hold = None, 0, 10   # 10 billeder = en tredjedel sekund
        # Jonglering: bolden er i luften, saa der soeges i hele billedet, og personen
        # udelukkes, saa hud og haar ikke tages for bolden.
        self.hele = hele_billedet
        if hele_billedet:
            self.bold_graense = 0.0
            self.hold = 4          # bolden flyver hurtigt: en gammel cirkel bliver ellers til et spor
        self.efterslaeb = 0.25 if hele_billedet else 0.55

    def person(self, bgr):
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        return self.seg.process(rgb).segmentation_mask.astype(np.float32)

    def bold(self, bgr, personmaske):
        """Bolden er det eneste, der AFVIGER fra gulvets farve i den nederste del af billedet. Gulvet
        har sin egen farvetone og styrke; bolden er flerfarvet. Et pixel regnes for bold, hvis dets
        farvetone ligger langt fra gulvets, eller hvis det er markant staerkere farvet end gulvet.
        Den stoerste klump findes, og hele boldens cirkel tegnes (felterne er ikke alle lige farvede)."""
        h, w = bgr.shape[:2]
        hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
        r0 = int(h * self.bold_graense)
        nede = hsv[r0:]
        lys = nede[..., 2] > 70
        ud = np.zeros((h, w), np.float32)
        if lys.sum() < 500:
            return ud
        hue, sat, val = nede[..., 0].astype(np.int32), nede[..., 1].astype(np.int32), nede[..., 2]
        gulv_h, gulv_s = np.median(hue[lys]), np.median(sat[lys])
        forskel = np.abs(hue - gulv_h); forskel = np.minimum(forskel, 180 - forskel)   # farvetone er en cirkel
        farvet = (((forskel > 20) & (sat > 55)) | (sat > gulv_s + 55)) & (val > 45)
        m = np.zeros((h, w), np.uint8); m[r0:] = farvet
        if self.hele:
            m[personmaske > 0.5] = 0
        k = int(w * 0.04) | 1
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
        n, lab, stat, cent = cv2.connectedComponentsWithStats(m)
        cirkel = None
        if n > 1:
            i = 1 + int(np.argmax(stat[1:, cv2.CC_STAT_AREA]))
            if self.hele and self.sidste_bold is not None:
                # Flere farvede ting i billedet: tag den, der ligger naermest boldens sidste plads.
                kandidater = [j for j in range(1, n) if stat[j, cv2.CC_STAT_AREA] >= 0.002 * h * w]
                if kandidater:
                    sx, sy = self.sidste_bold[0], self.sidste_bold[1]
                    i = min(kandidater, key=lambda j: np.hypot(cent[j][0] - sx, cent[j][1] - sy))
            # En bold i fart deles af bevaegelsessloeringen i flere stumper. Stumper taet paa
            # den stoerste regnes med, saa de tilsammen kan vaere en bold.
            radius = np.sqrt(stat[i, cv2.CC_STAT_AREA])
            med = [j for j in range(1, n) if stat[j, cv2.CC_STAT_AREA] >= 0.0003 * h * w
                   and np.hypot(*(cent[j] - cent[i])) < 2.2 * radius]
            areal = sum(stat[j, cv2.CC_STAT_AREA] for j in med)
            if areal >= 0.003 * h * w:                       # stort nok til at vaere en bold
                pts = cv2.findNonZero(np.isin(lab, med).astype(np.uint8))
                (cx, cy), r = cv2.minEnclosingCircle(pts)
                cirkel = (cx, cy, min(r * 1.25, w * 0.16))  # en bold er aldrig stoerre end det
        if cirkel is not None:
            self.sidste_bold, self.mistet = cirkel, 0
        elif self.sidste_bold is not None and self.mistet < self.hold:
            # Bolden er tabt et oejeblik (fart, skygge, en fod hen over den): brug den sidste
            # kendte cirkel lidt stoerre, i stedet for at sloere bolden i et enkelt billede.
            self.mistet += 1
            cx, cy, r = self.sidste_bold
            cirkel = (cx, cy, min(r * (1 + 0.04 * self.mistet), w * 0.18))
        if cirkel is not None:
            cv2.circle(ud, (int(cirkel[0]), int(cirkel[1])), int(cirkel[2]), 1.0, -1)
        return ud

    def hent(self, bgr, glat=True):
        h, w = bgr.shape[:2]
        p = self.person(bgr)
        p = cv2.GaussianBlur(p, (0, 0), 2)
        p = np.clip((p - 0.35) / 0.4, 0, 1)          # skarpere kant omkring personen
        if self.kun_en_person:
            # Modellen tager af og til en ting paa gulvet for en del af personen. Kun den
            # stoerste sammenhaengende flade beholdes.
            n, lab, st, _ = cv2.connectedComponentsWithStats((p > 0.5).astype(np.uint8))
            if n > 2:
                stoerst = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
                behold = cv2.dilate((lab == stoerst).astype(np.uint8), np.ones((15, 15), np.uint8))
                p = p * behold
        # Lidt luft rundt om personen, saa fingre, haar og tøjets kant ikke bliver slørede.
        luft = int(w * 0.018) | 1
        p = cv2.dilate(p, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (luft, luft)))
        b = self.bold(bgr, p)
        m = np.maximum(p, b)
        if glat and self.forrige is not None:        # undgaa flimmer: masken må ikke hoppe fra billede til billede
            m = np.maximum(m, self.efterslaeb * self.forrige)
        self.forrige = m
        return np.clip(cv2.GaussianBlur(m, (0, 0), w * 0.006), 0, 1), p, b
