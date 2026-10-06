"""Court Vision 3D asset prep (run once offline).
Backdrop: lanczos 2x upscale + light unsharp, centred crop, sky/floor extension
(gradient + blurred mirror — never stretched pixels). Env equirect from the plate.
Logo decal from the real wordmark."""
import json, math
import numpy as np
from PIL import Image, ImageFilter

SRC = '/workspace/brand-assets/realistic-court-plate.jpg'
LOGO = '/workspace/brand-assets/wordmark-white-stacked.png'
OUT = 'public/art/cv3d/'

plate = Image.open(SRC).convert('RGB')
W, H = plate.size  # 1280x720
S = 2
up = plate.resize((W * S, H * S), Image.LANCZOS).filter(
    ImageFilter.UnsharpMask(radius=1.6, percent=55, threshold=2))

X0, CW = 256, 768          # crop in 1x plate px
TOP, BOT = 300, 100        # extensions in 1x px
crop = up.crop((X0 * S, 0, (X0 + CW) * S, H * S))
cw, ch = crop.size
arr = np.asarray(crop).astype(np.float32)

# ── Sky extension: gradient + blurred mirror of the cloud band only
band = TOP * S
cloud = 70 * S                       # mirror only clouds (no skyline)
mirror = np.flipud(arr[:cloud])
mirror = np.asarray(Image.fromarray(mirror.astype(np.uint8)).filter(
    ImageFilter.GaussianBlur(14))).astype(np.float32)
row_means = arr[:cloud].mean(axis=1)            # per-row colour (cloud tones)
top_mean = arr[:10].mean(axis=(0, 1))
zenith = np.array([52, 36, 84], np.float32)
ext = np.zeros((band, cw, 3), np.float32)
for r in range(band):
    d = band - 1 - r                  # distance above the plate top (px)
    k = min(1.0, d / band)            # 0 at seam → 1 at very top
    grad = top_mean * (1 - k) ** 1.4 + zenith * (1 - (1 - k) ** 1.4)
    if d < cloud:
        m = (1 - d / cloud) ** 1.2 * 0.85
        ext[r] = grad[None, :] * (1 - m) + mirror[d] * m
    else:
        ext[r] = grad[None, :]
# soften the seam: blur the 40px around it
seam_img = Image.fromarray(np.concatenate([ext[-40 * S:], arr[:24 * S]]).clip(0, 255).astype(np.uint8))
seam_bl = np.asarray(seam_img.filter(ImageFilter.GaussianBlur(5))).astype(np.float32)
n1 = 40 * S
for r in range(n1 + 24 * S):
    dist = abs(r - n1) / (16 * S)
    a = max(0.0, 1 - dist)
    if r < n1:
        ext[band - n1 + r] = ext[band - n1 + r] * (1 - a) + seam_bl[r] * a
    else:
        arr[r - n1] = arr[r - n1] * (1 - a) + seam_bl[r] * a

# ── Floor extension: quilted asphalt patches sampled from the plate floor
#    (below the plate's bottom arc is plain court, so no lines continue)
fb = BOT * S
rng = np.random.default_rng(7)
src_band = arr[int(640 * S):int(698 * S)]             # asphalt between the line and the arc
src_low = np.asarray(Image.fromarray(src_band.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(7))).astype(np.float32)
src_detail = src_band - src_low                        # grain only (no light pools)
# remove line pixels from the source band by masking bright, low-sat texels
lum = src_band.mean(axis=2)
ph, pw = 64 * S // 2, 140 * S // 2
fm = np.zeros((fb + ph, cw, 3), np.float32)
wsum = np.zeros((fb + ph, cw, 1), np.float32)
yy = np.linspace(-1, 1, ph)[:, None]
xx = np.linspace(-1, 1, pw)[None, :]
feather = (np.clip((1 - np.abs(yy)) * 5, 0, 1) * np.clip((1 - np.abs(xx)) * 5, 0, 1))[..., None] + 1e-3
for y0 in range(-ph // 5, fb, int(ph * 0.8)):
    for x0 in range(-pw // 5 + (y0 * 37) % (pw // 2), cw, int(pw * 0.8)):
        for _ in range(8):
            sy = rng.integers(0, src_band.shape[0] - ph)
            sx = rng.integers(0, src_band.shape[1] - pw)
            patch = src_detail[sy:sy + ph, sx:sx + pw]
            if lum[sy:sy + ph, sx:sx + pw].max() < 150:   # no court-line paint
                break
        ty0, tx0 = max(0, y0), max(0, x0)
        ty1, tx1 = min(fb + ph, y0 + ph), min(cw, x0 + pw)
        if ty1 <= ty0 or tx1 <= tx0:
            continue
        py0, px0 = ty0 - y0, tx0 - x0
        p = patch[py0:py0 + ty1 - ty0, px0:px0 + tx1 - tx0]
        f = feather[py0:py0 + ty1 - ty0, px0:px0 + tx1 - tx0]
        fm[ty0:ty1, tx0:tx1] += p * f
        wsum[ty0:ty1, tx0:tx1] += f
fm = (fm / np.maximum(wsum, 1e-4))[:fb]
# smooth base: low-passed plate bottom rows, continued downward
base_row = np.asarray(Image.fromarray(arr[-10 * S:].clip(0, 255).astype(np.uint8)).filter(
    ImageFilter.GaussianBlur(24))).astype(np.float32).mean(axis=0)
k = 181
pad_ = np.pad(base_row, ((k // 2, k // 2), (0, 0)), mode='edge')
base_s = np.stack([np.convolve(pad_[:, c], np.ones(k) / k, mode='valid') for c in range(3)], axis=1)
mean_c = base_row.mean(axis=0)
rows_ = []
for r in range(fb):
    t_ = min(1.0, r / (fb * 0.6))
    rows_.append(base_row * (1 - t_) * 0.25 + base_s * (1 - (1 - t_) * 0.25) * (1 - t_ * 0.3) + mean_c * t_ * 0.3)
fm = np.stack(rows_) + fm * 1.05
for r in range(fb):
    fm[r] *= 1 - 0.3 * (r / fb) ** 1.3
# feather seam into the last plate rows
seamf = 14 * S
for r in range(seamf):
    a_ = (r + 1) / (seamf + 1)
    arr[-seamf + r] = arr[-seamf + r] * (1 - a_ * 0.5) + fm[0] * (a_ * 0.5)

full = np.concatenate([ext, arr, fm], axis=0).clip(0, 255).astype(np.uint8)
img = Image.fromarray(full)
img.save(OUT + 'court-plate.webp', quality=84, method=6)
img.save(OUT + 'court-plate.avif', quality=62)
meta = dict(x0=X0, w=CW, y0=-TOP, h=H + TOP + BOT, plateW=W, plateH=H,
            horizonY=459, baselineY=540, scale=S)
json.dump(meta, open(OUT + 'court-plate.json', 'w'))
print('backdrop', img.size, meta)

# ── Env equirect 1024x512 from the plate (ping-pong in longitude)
F = 805.0
EW, EH = 1024, 512
p = np.asarray(plate).astype(np.float32)
sky_top = p[:8].mean(axis=(0, 1))
floor_col = p[-60:].mean(axis=(0, 1)) * 0.75
env = np.zeros((EH, EW, 3), np.float32)
half = math.degrees(math.atan(640 / F)) - 1
for j in range(EH):
    lat = math.radians(90 - (j + 0.5) * 180 / EH)
    for i in range(EW):
        lon = (i + 0.5) * 360 / EW - 180
        u = (lon + half) % (4 * half)
        if u > 2 * half: u = 4 * half - u
        l = math.radians(u - half)
        x = 640 + F * math.tan(l)
        y = 459 - F * math.tan(lat) / math.cos(l)
        if y < 0:
            k = min(1, -y / 900)
            env[j, i] = sky_top * (1 - k) + np.array([40, 30, 70]) * k
        elif y > H - 1:
            k = min(1, (y - H) / 600)
            env[j, i] = floor_col * (1 - k * 0.6)
        else:
            env[j, i] = p[int(y), int(max(0, min(W - 1, x)))]
envimg = Image.fromarray(env.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
envimg.save(OUT + 'env-sunset.webp', quality=86)
print('env', envimg.size)

# ── Logo decal (real letterforms, lanczos)
logo = Image.open(LOGO).convert('RGBA').crop((46, 280, 2055, 1242))
lw = 1024
lh = round(logo.height * lw / logo.width)
logo = logo.resize((lw, lh), Image.LANCZOS)
pad = Image.new('RGBA', (lw + 32, lh + 32), (255, 255, 255, 0))
pad.paste(logo, (16, 16))
pad.save(OUT + 'logo-decal.webp', lossless=True)
print('logo', pad.size)
