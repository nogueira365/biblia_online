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
bg = Image.new('RGBA', (final_size, final_size), (0, 0, 0, 0)) # Fundo transparente

# Calcula a escala para a imagem caber confortavelmente com um pouco de padding (ex: 400x400)
target_inner_size = 400
scale = min(target_inner_size / img.width, target_inner_size / img.height)
new_w = int(img.width * scale)
new_h = int(img.height * scale)

img_resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

# Remove o fundo preto se existir (tornando preto transparente)
# Vamos varrer os pixels. Se for muito escuro (próximo de preto), deixa transparente.
# Isso é um pequeno truque, pois a imagem parece ter fundo preto.
data = img_resized.getdata()
new_data = []
for item in data:
    # item é (R, G, B, A)
    # Se for quase preto e ocre/vermelho escuro não for afetado...
    # O logo <N> tem cores vibrantes (rosa, laranja). O fundo é quase rgb(0,0,0) ou azul muito escuro.
    # Vamos checar se rgb < 20,20,20
    if item[0] < 20 and item[1] < 20 and item[2] < 20:
        new_data.append((0, 0, 0, 0))
    else:
        new_data.append(item)
img_resized.putdata(new_data)

# Cola a imagem redimensionada no centro
x = (final_size - new_w) // 2
y = (final_size - new_h) // 2
bg.paste(img_resized, (x, y), img_resized)

# Salva como app-icon.png
bg.save('imagens/app-icon.png')
print("Ícone criado com sucesso!")
