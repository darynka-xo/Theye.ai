// code.ts

figma.showUI(__html__, { width: 300, height: 200 });

// Интерфейсы данных
interface ElementData {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface PredictionResult {
    frameName: string;
    width: number;
    height: number;
    elements: { [key: string]: ElementData };
}

const expectedTypes = [
    'age_restriction',
    'disclaimer',
    'imageGroup',
    'logo',
    'saleText',
    'salesBadge',
    'textGroup',
    'vectorImage',
];

function cleanElementName(name: string): string {
    // Удаляем цифры в конце названия
    let cleanedName = name.replace(/\d+$/, '');

    // Приводим название к нижнему регистру для упрощения сравнения
    cleanedName = cleanedName.toLowerCase();

    // Специальные сопоставления
    const specialMappings: { [key: string]: string } = {
        'imageframe': 'imageGroup',
        'textframe': 'textGroup',
        'vectorimage': 'vectorImage',
    };

    // Проверяем наличие точного совпадения в specialMappings
    if (specialMappings[cleanedName]) {
        return specialMappings[cleanedName];
    }

    // Проверяем наличие ключевого слова из ожидаемых типов
    for (const type of expectedTypes) {
        const regex = new RegExp(type, 'i'); // Регистр независим
        if (regex.test(cleanedName)) {
            // Возвращаем стандартное имя типа
            return type;
        }
    }

    // Если нет совпадений, возвращаем исходное имя без цифр на конце
    return cleanedName;
}


// Функция для отправки данных на API и получения предсказаний
async function getPredictions(frameData: any): Promise<PredictionResult> {
    // Логирование тела запроса
    console.log('Отправляемое тело запроса:', JSON.stringify(frameData, null, 2));

    const response = await fetch('https://easyai.kz/predict', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(frameData),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ошибка API: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return data as PredictionResult;
}

// Главная функция плагина
async function main(desiredWidth: number, desiredHeight: number) {
    // Проверяем, есть ли выбранные объекты
    if (!figma.currentPage.selection.length) {
        figma.notify('Пожалуйста, выберите один или несколько фреймов.');
        return;
    }

    const framesToProcess: FrameNode[] = [];

    // Собираем только фреймы из выбранных объектов
    for (const node of figma.currentPage.selection) {
        if (node.type === 'FRAME') {
            framesToProcess.push(node as FrameNode);
        }
    }

    if (framesToProcess.length === 0) {
        figma.notify('Выбранные объекты не содержат фреймы.');
        return;
    }

    // Обрабатываем фреймы
    await processFrames(framesToProcess, desiredWidth, desiredHeight);

    figma.closePlugin(); // Закрываем плагин после выполнения
}

// Функция для обработки фреймов
async function processFrames(frames: FrameNode[], desiredWidth: number, desiredHeight: number) {
    for (const frame of frames) {
        // Собираем данные о фрейме
        const frameData: any = {
            frameName: frame.name,
            width: frame.width,
            height: frame.height,
            desiredWidth: desiredWidth,
            desiredHeight: desiredHeight,
        };

        // Собираем данные о дочерних элементах
        for (const child of frame.children) {
            // Оригинальное имя узла
            const originalName = child.name;

            // Очищенное имя для использования в запросе
            const elementType = cleanElementName(originalName);

            // Проверяем, является ли child допустимым узлом
            if ('x' in child && 'y' in child && 'width' in child && 'height' in child) {
                frameData[elementType] = {
                    x: child.x,
                    y: child.y,
                    width: child.width,
                    height: child.height,
                };
            } else {
                // Если узел не поддерживает необходимые свойства, установим значение null
                frameData[elementType] = null;
            }
        }

        try {
            console.log('Отправляем на API frameData:', JSON.stringify(frameData, null, 2));
            const prediction = await getPredictions(frameData);
            console.log('Получен ответ от API:', JSON.stringify(prediction, null, 2));

            if (!prediction.width || !prediction.height) {
                throw new Error('Получены некорректные размеры фрейма из API.');
            }

            if (!prediction.elements || Object.keys(prediction.elements).length === 0) {
                throw new Error('API не вернул данные о элементах.');
            }

            // Клонируем оригинальный фрейм
            const newFrame = frame.clone() as FrameNode;

            newFrame.name = prediction.frameName;
            newFrame.x = frame.x + frame.width + 50;
            newFrame.y = frame.y;

            // Изменяем размер нового фрейма
            newFrame.resizeWithoutConstraints(prediction.width, prediction.height);

            // Применяем предсказанные позиции и размеры к элементам
            await applyPredictedSizes(newFrame, prediction.elements);

        } catch (error) {
            figma.notify(`Ошибка при обработке фрейма '${frame.name}': ${error.message}`);
            console.error(`Ошибка при обработке фрейма '${frame.name}':`, error);
        }
    }
}
async function applyPredictedSizes(frame: FrameNode, predictedElements: { [key: string]: ElementData }) {
    for (const [elementName, elementData] of Object.entries(predictedElements)) {
        const node = frame.findOne(n => cleanElementName(n.name) === elementName) as SceneNode | null;

        if (!node) {
            console.warn(`Element '${elementName}' not found in frame '${frame.name}', skipping.`);
            continue;
        }

        // Update position
        node.x = elementData.x;
        node.y = elementData.y;

        // Resize elements
        if ('resize' in node) {
            // Handle text nodes
            if (node.type === 'TEXT') {
                const textNode = node as TextNode;
                await loadFontsRecursively(textNode);

                textNode.textAutoResize = 'NONE'; // Disable auto resizing
                const scaleX = elementData.width / node.width;
                const scaleY = elementData.height / node.height;
                const scale = Math.min(scaleX, scaleY);

                if (typeof textNode.fontSize === 'number') {
                    const newFontSize = Math.max(1, textNode.fontSize * scale);
                    console.log(`Scaling font from ${textNode.fontSize} to ${newFontSize}`);
                    textNode.fontSize = newFontSize;
                }

                if (textNode.lineHeight !== figma.mixed && textNode.lineHeight.unit !== 'AUTO') {
                    textNode.lineHeight = {
                        ...textNode.lineHeight,
                        value: Math.max(1, (textNode.lineHeight.value as number) * scale),
                    };
                }

                if (textNode.letterSpacing !== figma.mixed) {
                    textNode.letterSpacing = {
                        ...textNode.letterSpacing,
                        value: Math.max(0, (textNode.letterSpacing.value as number) * scale),
                    };
                }

                textNode.resize(elementData.width, elementData.height); // Resize the container

            }
            // Handle other node types
            else {
                node.resize(elementData.width, elementData.height);
            }
        }
    }
}





async function loadFontsRecursively(node: SceneNode) {


    if (node.type === 'TEXT') {
        const textNode = node as TextNode;
        const fontNames = textNode.getRangeAllFontNames(0, textNode.characters.length);
        const uniqueFontNames = Array.from(new Set(fontNames.map(f => JSON.stringify(f)))).map(f => JSON.parse(f));
        for (const font of uniqueFontNames) {
            try {
                await figma.loadFontAsync(font as FontName);
            } catch (error) {
                console.error(`Не удалось загрузить шрифт ${font.family} ${font.style}:`, error);
                figma.notify(`Не удалось загрузить шрифт ${font.family} ${font.style}.`);
            }
        }
    } else if ('children' in node) {
        for (const child of node.children) {
            await loadFontsRecursively(child as SceneNode);
        }
    }
}


// Обработчик сообщений от UI
figma.ui.onmessage = async (msg) => {
    if (msg.type === 'desiredSize') {
        const desiredWidth = msg.width;
        const desiredHeight = msg.height;

        if (desiredWidth <= 0 || desiredHeight <= 0) {
            figma.notify('Недопустимые размеры. Пожалуйста, введите положительные значения.');
            return;
        }

        await main(desiredWidth, desiredHeight);
    }
};
