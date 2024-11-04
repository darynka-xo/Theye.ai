// code.js

// Главная функция плагина
async function main() {
    // Показываем пользовательский интерфейс, указанный в manifest.json
    figma.showUI({ width: 200, height: 100 });

    // Обрабатываем сообщения от UI
    figma.ui.onmessage = async (msg) => {
        if (msg.type === 'export-json') {
            await exportSelectedNodesAsJson();
        }
    };
}

// Функция для экспорта выбранных узлов в JSON
async function exportSelectedNodesAsJson() {
    try {
        // Счетчики для уникальных имен
        const nameCounters = {
            logo: 0,
            main_image: 2,
            text: 0,
            disclaimer: 0
        };

        // Пороговые значения
        const SMALL_FONT_THRESHOLD = 12;     // Порог для мелкого текста
        const LOGO_AREA_RATIO = 0.15;        // 15% площади фрейма для логотипа

        // Получаем текущий выбор пользователя
        const selection = figma.currentPage.selection;

        if (selection.length === 0) {
            figma.notify("Пожалуйста, выберите фрейм для обработки.");
            return;
        }

        const frame = selection[0];

        if (frame.type !== 'FRAME') {
            figma.notify("Пожалуйста, выберите фрейм.");
            return;
        }

        const frameArea = frame.width * frame.height;

        // Загрузка шрифтов для текстовых узлов
        await loadFonts(frame);

        // Обрабатываем узлы и собираем данные
        const data = collectNodeData(frame, frameArea, nameCounters, SMALL_FONT_THRESHOLD, LOGO_AREA_RATIO);

        // Преобразуем данные в JSON
        const jsonData = JSON.stringify(data, null, 2);

        // Отправляем данные в UI для скачивания
        figma.ui.postMessage({ type: 'download-json', data: jsonData });

        figma.notify("Данные успешно экспортированы.");
    } catch (error) {
        console.error('Ошибка при экспорте данных:', error);
        figma.notify("Произошла ошибка при экспорте данных.");
    }
}

// Функция для сбора данных из узлов
function collectNodeData(node, frameArea, nameCounters, SMALL_FONT_THRESHOLD, LOGO_AREA_RATIO) {
    let classification = null;

    // Рассчитываем площадь элемента
    const elementArea = node.width * node.height;

    // Собираем базовые данные узла
    const nodeData = {
        id: node.id,
        name: node.name,
        type: node.type,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height
    };

    if (node.type === 'TEXT') {
        const fontSize = node.fontSize || SMALL_FONT_THRESHOLD + 1;
        nodeData.fontSize = fontSize;
        nodeData.characters = node.characters;
        nodeData.textAlignHorizontal = node.textAlignHorizontal;
        nodeData.textAlignVertical = node.textAlignVertical;

        try {
            nodeData.fontName = node.fontName;
        } catch (e) {
            console.error('Ошибка при получении fontName:', e);
        }

        if (fontSize < SMALL_FONT_THRESHOLD) {
            classification = 'disclaimer';
        } else {
            classification = 'text';
        }
    } else if (['RECTANGLE', 'ELLIPSE', 'POLYGON', 'STAR', 'VECTOR', 'GROUP', 'COMPONENT', 'INSTANCE', 'COMPONENT_SET'].includes(node.type)) {
        if (elementArea < frameArea * LOGO_AREA_RATIO) {
            classification = 'logo';
        } else {
            classification = 'main_image';
        }
    }

    if (classification) {
        nameCounters[classification] += 1;
        nodeData.name = `${classification}${nameCounters[classification]}`;
        node.name = nodeData.name; // Переименовываем узел в Figma
    }

    // Дополнительные свойства
    if ('fills' in node) {
        nodeData.fills = node.fills;
    }

    // Обрабатываем дочерние узлы
    if ('children' in node) {
        nodeData.children = [];
        for (const child of node.children) {
            nodeData.children.push(collectNodeData(child, frameArea, nameCounters, SMALL_FONT_THRESHOLD, LOGO_AREA_RATIO));
        }
    }

    return nodeData;
}

// Обновленная функция для загрузки шрифтов
async function loadFonts(node) {
    if (node.type === 'TEXT') {
        try {
            const fontNames = node.getRangeAllFontNames(0, node.characters.length);

            for (const fontName of fontNames) {
                await figma.loadFontAsync(fontName);
            }
        } catch (e) {
            console.error('Ошибка при загрузке шрифтов:', e);
        }
    }

    if ('children' in node) {
        for (const child of node.children) {
            await loadFonts(child);
        }
    }
}

// Запускаем плагин
main();
