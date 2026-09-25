import sys
import subprocess

try:
    from PIL import Image
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
    from PIL import Image

# Abre a imagem original
img = Image.open('imagens/Logo N.png').convert('RGBA')

# Define o tamanho final para 512x512
final_size = 512
# Fundo sólido igual ao do app (dark blue: #0f172a -> 15, 23, 42)
bg = Image.new('RGBA', (final_size, final_size), (15, 23, 42, 255))

# Calcula a escala para a imagem ter um tamanho ideal para splash screen (com bastante margem)
target_inner_size = 280
scale = min(target_inner_size / img.width, target_inner_size / img.height)
new_w = int(img.width * scale)
new_h = int(img.height * scale)

img_resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

# Remove o fundo preto do logo <N> para deixar transparente
data = img_resized.getdata()
new_data = []
for item in data:
    if item[0] < 20 and item[1] < 20 and item[2] < 20:
        new_data.append((0, 0, 0, 0))
    else:
        new_data.append(item)
img_resized.putdata(new_data)

# Cola a imagem redimensionada no centro
x = (final_size - new_w) // 2
y = (final_size - new_h) // 2
bg.paste(img_resized, (x, y), img_resized)

# Salva a imagem
bg.save('imagens/app-icon.png')
print("Ícone premium para splash screen gerado com sucesso!")
