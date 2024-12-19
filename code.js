function sanitizeData(obj) {
    if (obj === figma.mixed) {
        return null;
    }
    if (Array.isArray(obj)) {
        return obj.map(sanitizeData);
    }
    else if (obj !== null && typeof obj === 'object') {
        const newObj = {};
        for (const [key, value] of Object.entries(obj)) {
            newObj[key] = sanitizeData(value);
        }
        return newObj;
    }
    return obj;
}
function serializePaints(paints) {
    if (!paints || paints === figma.mixed)
        return null;
    return paints.map(paint => {
        if (paint.type === 'SOLID') {
            return {
                type: paint.type,
                visible: paint.visible,
                opacity: paint.opacity,
                blendMode: paint.blendMode,
                color: paint.color,
            };
        }
        if (paint.type === 'IMAGE') {
            return {
                type: paint.type,
                visible: paint.visible,
                opacity: paint.opacity,
                blendMode: paint.blendMode,
                scaleMode: paint.scaleMode,
                imageHash: paint.imageHash
            };
        }
        return { type: paint.type };
    });
}
function extractNodeProperties(node) {
    const properties = {
        type: node.type,
    };
    if ('fills' in node) {
        const geometryNode = node;
        if (geometryNode.fills === figma.mixed) {
            properties.fills = null;
        }
        else {
            properties.fills = serializePaints(geometryNode.fills);
            const imageFills = geometryNode.fills.filter(fill => fill.type === 'IMAGE');
            if (imageFills.length > 0) {
                properties.imageFills = imageFills.map(fill => ({
                    imageHash: fill.imageHash
                }));
            }
        }
    }
    if (node.type === 'TEXT') {
        const textNode = node;
        properties.characters = textNode.characters;
        properties.fontSize = textNode.fontSize === figma.mixed ? null : textNode.fontSize;
        properties.fontName = textNode.fontName === figma.mixed ? null : textNode.fontName;
        properties.letterSpacing = textNode.letterSpacing === figma.mixed ? null : textNode.letterSpacing;
        properties.lineHeight = textNode.lineHeight === figma.mixed ? null : textNode.lineHeight;
        properties.paragraphIndent = textNode.paragraphIndent;
        properties.paragraphSpacing = textNode.paragraphSpacing;
        properties.textCase = textNode.textCase;
        properties.textDecoration = textNode.textDecoration;
        properties.textAlignHorizontal = textNode.textAlignHorizontal;
        properties.textAlignVertical = textNode.textAlignVertical;
    }
    if (node.type === 'RECTANGLE' ||
        node.type === 'ELLIPSE' ||
        node.type === 'POLYGON' ||
        node.type === 'STAR' ||
        node.type === 'VECTOR') {
        const shapeNode = node;
        properties.strokes = shapeNode.strokes;
        properties.strokeWeight = shapeNode.strokeWeight;
        properties.strokeAlign = shapeNode.strokeAlign;
        properties.cornerRadius = shapeNode.cornerRadius;
        properties.cornerSmoothing = shapeNode.cornerSmoothing;
    }
    if ('effects' in node) {
        const blendNode = node;
        properties.effects = blendNode.effects;
    }
    if ('layoutAlign' in node) {
        properties.layoutAlign = node.layoutAlign;
    }
    if ('layoutGrow' in node) {
        properties.layoutGrow = node.layoutGrow;
    }
    return properties;
}
function cleanElementName(name) {
    let cleanedName = name.replace(/\d+$/, '');
    cleanedName = cleanedName.toLowerCase();
    const specialMappings = {
        'imageframe': 'imageGroup',
        'textframe': 'textGroup',
        'vectorimage': 'vectorImage',
    };
    if (specialMappings[cleanedName]) {
        return specialMappings[cleanedName];
    }
    for (const type of expectedTypes) {
        const regex = new RegExp(type, 'i');
        if (regex.test(cleanedName)) {
            return type;
        }
    }
    return cleanedName;
}
function adjustPositionRelativeToParent(parentOriginalWidth, parentOriginalHeight, parentNewWidth, parentNewHeight, childX, childY) {
    const scaleX = parentNewWidth / parentOriginalWidth;
    const scaleY = parentNewHeight / parentOriginalHeight;
    return {
        x: childX * scaleX,
        y: childY * scaleY,
    };
}
function getNodeBounds(node) {
    if (hasBounds(node)) {
        return node.bounds;
    }
    return { x: 0, y: 0, width: 0, height: 0 };
}
function hasBounds(node) {
    return 'bounds' in node && node.bounds !== undefined && typeof node.bounds === 'object';
}
function canResize(node) {
    return node.type === 'FRAME' || node.type === 'GROUP';
}
function checkAndResolveOverlap(nodeA, nodeB, frame) {
    const aBounds = getNodeBounds(nodeA);
    const bBounds = getNodeBounds(nodeB);
    if (aBounds.x < bBounds.x + bBounds.width &&
        aBounds.x + aBounds.width > bBounds.x &&
        aBounds.y < bBounds.y + bBounds.height &&
        aBounds.y + aBounds.height > bBounds.y) {
        const overlapX = Math.min(aBounds.x + aBounds.width, bBounds.x + bBounds.width) - Math.max(aBounds.x, bBounds.x);
        const overlapY = Math.min(aBounds.y + aBounds.height, bBounds.y + bBounds.height) - Math.max(aBounds.y, bBounds.y);
        if (overlapX > overlapY) {
            nodeB.x += overlapX + 10;
        }
        else {
            nodeB.y += overlapY + 10;
        }
        nodeB.x = Math.max(0, Math.min(frame.width - nodeB.width, nodeB.x));
        nodeB.y = Math.max(0, Math.min(frame.height - nodeB.height, nodeB.y));
    }
}
function preserveAspectRatio(originalWidth, originalHeight, maxWidth, maxHeight, minScale = 0.1) {
    const scale = Math.max(Math.min(maxWidth / originalWidth, maxHeight / originalHeight), minScale);
    return {
        width: originalWidth * scale,
        height: originalHeight * scale,
    };
}
function adjustPositionToFitFrame(x, y, elementWidth, elementHeight, frameWidth, frameHeight) {
    return {
        x: Math.max(0, Math.min(frameWidth - elementWidth, x)),
        y: Math.max(0, Math.min(frameHeight - elementHeight, y)),
    };
}
function resolveOverlapWithPadding(nodeA, nodeB, padding = 10) {
    const aBounds = { x: nodeA.x, y: nodeA.y, width: nodeA.width, height: nodeA.height };
    const bBounds = { x: nodeB.x, y: nodeB.y, width: nodeB.width, height: nodeB.height };
    if (aBounds.x < bBounds.x + bBounds.width &&
        aBounds.x + aBounds.width > bBounds.x &&
        aBounds.y < bBounds.y + bBounds.height &&
        aBounds.y + aBounds.height > bBounds.y) {
        if (aBounds.y + aBounds.height + padding < bBounds.y) {
            nodeB.y += padding + aBounds.height;
        }
        else {
            nodeB.x += padding + aBounds.width;
        }
    }
}
function getAbsolutePosition(node) {
    const transform = node.absoluteTransform;
    return { x: transform[0][2], y: transform[1][2] };
}
function getRelativePosition(node, parentNode) {
    const nodePosition = getAbsolutePosition(node);
    const parentPosition = getAbsolutePosition(parentNode);
    return {
        x: nodePosition.x - parentPosition.x,
        y: nodePosition.y - parentPosition.y,
    };
}
function findNodeByNames(node, baseNames) {
    for (const baseName of baseNames) {
        if (node.name.startsWith(baseName)) {
            return node;
        }
    }
    if ('children' in node) {
        for (const child of node.children) {
            const result = findNodeByNames(child, baseNames);
            if (result) {
                return result;
            }
        }
    }
    return null;
}
async function extractFrames(nodes) {
    const frames = [];
    for (const node of nodes) {
        if (node.type === 'FRAME') {
            const frameData = {
                frameName: node.name,
                width: node.width,
                height: node.height,
            };
            for (const key in elementsToFind) {
                const namesToSearch = elementsToFind[key];
                const foundNode = findNodeByNames(node, namesToSearch);
                if (foundNode) {
                    const relativePosition = getRelativePosition(foundNode, node);
                    frameData[key] = {
                        x: relativePosition.x,
                        y: relativePosition.y,
                        width: foundNode.width,
                        height: foundNode.height,
                        properties: sanitizeData(extractNodeProperties(foundNode)),
                    };
                }
                else {
                    frameData[key] = null;
                }
            }
            frames.push(frameData);
        }
    }
    return frames;
}
const elementsToFind = {
    'logo': ['logo'],
    'textGroup': ['textGroup', 'textFrame'],
    'imageGroup': ['imageGroup', 'imageFrame'],
    'saleGroup': ['saleFrame', 'saleGroup'],
    'disclaimer': ['disclaimer'],
    'age_restriction': ['age_restriction'],
    'salesBadge': ['salesBadge'],
    'saleText': ['saleText'],
    'text': ['text'],
    'frame': ['Frame'],
};
const expectedTypes = Object.keys(elementsToFind);
async function addImageDataToFrames(framesData) {
    for (const frameData of framesData) {
        for (const key of Object.keys(frameData)) {
            const element = frameData[key];
            if (element && element.properties && element.properties.imageFills) {
                const imageDataArray = [];
                for (const imgFill of element.properties.imageFills) {
                    if (imgFill.imageHash) {
                        const image = figma.getImageByHash(imgFill.imageHash);
                        if (image) {
                            const bytes = await image.getBytesAsync();
                            const base64 = figma.base64Encode(bytes);
                            imageDataArray.push({
                                imageHash: imgFill.imageHash,
                                base64: base64
                            });
                        }
                    }
                }
                if (imageDataArray.length > 0) {
                    element.properties.imageData = imageDataArray;
                }
            }
        }
    }
}
async function main(desiredWidth, desiredHeight) {
    if (!figma.currentPage.selection.length) {
        figma.notify('Please select one or more frames.');
        return;
    }
    const framesToProcess = [];
    for (const node of figma.currentPage.selection) {
        if (node.type === 'FRAME') {
            framesToProcess.push(node);
        }
    }
    if (framesToProcess.length === 0) {
        figma.notify('Selected objects do not contain frames.');
        return;
    }
    let framesData = await extractFrames(figma.currentPage.selection);
    await addImageDataToFrames(framesData);
    await processFrames(framesData, desiredWidth, desiredHeight);
    setTimeout(() => {
        figma.closePlugin();
    }, 2000);
}
async function processFrames(framesData, desiredWidth, desiredHeight) {
    for (const frameData of framesData) {
        frameData.desiredWidth = desiredWidth;
        frameData.desiredHeight = desiredHeight;
        const sanitizedFrameData = sanitizeData(frameData);
        try {
            const prediction = await getPredictions(sanitizedFrameData);
            const originalFrame = figma.currentPage.findOne(n => n.name === frameData.frameName && n.type === 'FRAME');
            if (!originalFrame) {
                console.error(`Original frame '${frameData.frameName}' not found.`);
                continue;
            }
            const newFrame = originalFrame.clone();
            newFrame.x = originalFrame.x;
            newFrame.y = originalFrame.y;
            figma.currentPage.appendChild(newFrame);
            figma.currentPage.selection = [newFrame];
            newFrame.name = prediction.frameName;
            newFrame.resizeWithoutConstraints(prediction.width, prediction.height);
            await loadFontsRecursively(newFrame);
            await applyPredictedSizes(newFrame, prediction, originalFrame.width, originalFrame.height, prediction.width, prediction.height);
        }
        catch (error) {
            figma.notify(`Error processing frame '${frameData.frameName}': ${error.message}`);
            console.error(`Error processing frame '${frameData.frameName}':`, error);
        }
    }
}
async function applyPredictedSizes(frame, prediction, originalFrameWidth, originalFrameHeight, newFrameWidth, newFrameHeight) {
    var _a;
    console.log('Starting applyPredictedSizes');
    const elementKeys = [
        'logo',
        'textGroup',
        'imageGroup',
        'saleGroup',
        'disclaimer',
        'age_restriction',
        'salesBadge',
        'saleText',
        'text',
        'frame'
    ];
    for (const elementName of elementKeys) {
        const elementData = prediction[elementName];
        if (!elementData)
            continue;
        const node = frame.findOne(n => cleanElementName(n.name) === elementName);
        if (!node)
            continue;
        const { x, y } = adjustPositionRelativeToParent(originalFrameWidth, originalFrameHeight, newFrameWidth, newFrameHeight, elementData.x, elementData.y);
        const constrainedPosition = adjustPositionToFitFrame(x, y, node.width, node.height, newFrameWidth, newFrameHeight);
        node.x = constrainedPosition.x;
        node.y = constrainedPosition.y;
        const { width: scaledWidth, height: scaledHeight } = preserveAspectRatio(elementData.width, elementData.height, newFrameWidth, newFrameHeight);
        if (canResize(node)) {
            node.resize(scaledWidth, scaledHeight);
        }
        if (node.type === 'TEXT' && ((_a = elementData.properties) === null || _a === void 0 ? void 0 : _a.fontSize)) {
            const textNode = node;
            const scaleFactor = Math.min(newFrameWidth / originalFrameWidth, newFrameHeight / originalFrameHeight);
            textNode.fontSize = Math.max(elementData.properties.fontSize * scaleFactor, 10);
        }
    }
    frame.children.forEach(childA => {
        for (let i = frame.children.indexOf(childA) + 1; i < frame.children.length; i++) {
            const childB = frame.children[i];
            checkAndResolveOverlap(childA, childB, frame);
        }
    });
}
async function loadFontsRecursively(node) {
    if (node.type === 'TEXT') {
        const textNode = node;
        const fontNames = textNode.getRangeAllFontNames(0, textNode.characters.length);
        for (const font of fontNames) {
            await figma.loadFontAsync(font);
        }
    }
    else if ('children' in node) {
        for (const child of node.children) {
            await loadFontsRecursively(child);
        }
    }
}
async function getPredictions(frameData) {
    const url = 'https://easyai.kz/predictv1';
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(frameData),
    };
    console.log('Sending request to API:', url);
    console.log('Request Method:', options.method);
    console.log('Request Headers:', options.headers);
    console.log('Request Body:', JSON.stringify(frameData, null, 2));
    const response = await fetch(url, options);
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    const responseData = await response.json();
    console.log('API Response:', JSON.stringify(responseData, null, 2));
    return responseData;
}
figma.showUI(__html__, { width: 400, height: 300 });
figma.ui.onmessage = async (msg) => {
    if (msg.type === 'export') {
        figma.notify('Exporting frames...');
        const framesData = await extractFrames(figma.currentPage.children);
        await addImageDataToFrames(framesData);
        figma.notify(`Found ${framesData.length} frames`);
        const sanitizedData = sanitizeData(framesData);
        figma.ui.postMessage({ type: 'result', data: sanitizedData });
    }
    if (msg.type === 'desiredSize') {
        const { width, height } = msg;
        if (width > 0 && height > 0) {
            await main(width, height);
        }
        else {
            figma.notify('Invalid size. Please enter positive values.');
        }
    }
};
