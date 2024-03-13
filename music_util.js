let currentStaffSystem;
let osmdElementIndex = null;
let svgObject = null;
let m21Object = null;
let noteId = null;  
let currentPitch = null;
let newPitch = null;
let currentBeat = null;
let newBeat = null;
let prevTouchY = null;
let isDragging = false;
let wasDragged = false;
let lastCalledTime = 0;
const moveNoteHeadColor = "#A9A9A9";
const delay = 16; // 60fps
const pitchArray = ['C1', 'D1', 'E1', 'F1', 'G1', 'A1', 'B1',
'C2', 'D2', 'E2', 'F2', 'G2', 'A2', 'B2',
'C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3',
'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4',
'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5',
'C6', 'D6', 'E6', 'F6', 'G6', 'A6', 'B6',
'C7', 'D7', 'E7', 'F7', 'G7', 'A7', 'B7',
'C8', 'D8', 'E8', 'F8', 'G8', 'A8', 'B8'];

function convertStrokeToFill(path) {
    const pathData = path.getAttribute('d');
    const strokeWidth = parseFloat(path.getAttribute('stroke-width')) || 1;
    const newPathData = [];

    // Split path data into commands and coordinates
    const commands = pathData.match(/[MLHVCSQTAZ][^MLHVCSQTAZ]*/g);

    if (commands) {
        let lastX = 0, lastY = 0;

        commands.forEach(command => {
            const type = command.charAt(0);
            const coords = command.slice(1).trim().split(/[\s,]+/).map(Number);

            if (type === 'M') {
                lastX = coords[0];
                lastY = coords[1];
            } else if (type === 'L') {
                const [x, y] = coords;
                // Create a rectangle for the line segment
                const rectPath = createRectanglePath(lastX, lastY, x, y, strokeWidth);
                newPathData.push(rectPath);

                lastX = x;
                lastY = y;
            }
        });
    }
    return newPathData;
}

function createRectanglePath(x1, y1, x2, y2, width) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const sin = dy / len;
    const cos = dx / len;
    const halfWidth = width / 2;

    // Calculate the four corners of the rectangle
    const x3 = x1 - halfWidth * sin;
    const y3 = y1 + halfWidth * cos;
    const x4 = x2 - halfWidth * sin;
    const y4 = y2 + halfWidth * cos;
    const x5 = x2 + halfWidth * sin;
    const y5 = y2 - halfWidth * cos;
    const x6 = x1 + halfWidth * sin;
    const y6 = y1 - halfWidth * cos;

    // Create a path for the rectangle
    return `M ${x3} ${y3} L ${x4} ${y4} L ${x5} ${y5} L ${x6} ${y6} Z`;
}

function combineAndResetSVG(svgElement) {
    if (svgElement.tagName === 'g') {
        // Get all path elements within the SVG
        let paths = svgElement.querySelectorAll('path');
        let combinedPathData = '';


        // Combine the 'd' attribute of each path
        paths.forEach(path => {
            if (path.getAttribute('fill') === 'none') {
                combinedPathData += convertStrokeToFill(path) + ' ';
            } else {
            combinedPathData += path.getAttribute('d') + ' ';
            }
        });

        // Create a new path element with the combined path data
        let newPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        newPath.setAttribute('d', combinedPathData.trim());

        // Clear existing paths and append the new path
        while (svgElement.firstChild) {
            svgElement.removeChild(svgElement.firstChild);
        }
        svgElement.appendChild(newPath);
        svgElement.setAttribute('fill-rule', 'evenodd');
    }

    var originSVGElement = SVG(svgElement).move(0, 0).node;

    return originSVGElement;
}

function extractPaletteElements(elements) {
    const elementNames = ['wholeNote', 'halfNote', 
                        'flat', 'dot', 'quarterNote', 'sharp', 
                        'staccato', 'eighthNote', 'tenuto', 'sixteenthNote', 
                        'accent', 'quarterRest', 'tie']

    let index = 0;
    const paletteElements = [];
    elements.forEach((element) => {
        let name;
        let object;
        if (element.classList.contains('vf-stavenote')) {
            const vfNote = element.querySelector('.vf-note');
            const modifier = element.querySelector('.vf-modifiers');
            const modifierPaths = modifier.querySelectorAll('path[fill][stroke="none"]');
            if (vfNote) {
                name = elementNames[index];
                object = combineAndResetSVG(vfNote);
                paletteElements.push({name, object});
                index++;
            }
            if (modifierPaths.length > 0) {
                modifierPaths.forEach((path) => {
                    name = elementNames[index];
                    object = combineAndResetSVG(path);
                    paletteElements.push({name, object});
                    index++;
                });
            }
        } else if (element.classList.contains('vf-curve')) {
            const curvePath = element.querySelector('path');
            if (curvePath) {
                name = elementNames[index];
                object = combineAndResetSVG(curvePath);
                paletteElements.push({name, object});
                index++;
            }
        }
    });

    return paletteElements;
}

function getTimeSignature(scoreStream) {
    const scorePart = scoreStream.parts.get(0);
    const timeSignature = scorePart.get(0).timeSignature;
    return timeSignature;
}

function findNearestStaffSystem(noteheadY) {
    const staffSystems = getStaffSystems();
    
    // Find the staff system that is nearest to the mouseY position
    const nearestSystemIndex = staffSystems.reduce((nearestIndex, currentSystem, currentIndex, systems) => {
        const nearestSystemYPositions = systems[nearestIndex];
        const currentSystemYPositions = currentSystem;
        
        const nearestDistance = Math.min(...nearestSystemYPositions.map(yPos => Math.abs(yPos - noteheadY)));
        const currentDistance = Math.min(...currentSystemYPositions.map(yPos => Math.abs(yPos - noteheadY)));

        return currentDistance < nearestDistance ? currentIndex : nearestIndex;
    }, 0);

    const nearestSystem = staffSystems[nearestSystemIndex];

    return nearestSystem;
}

function getPathLength(dAttribute) {
    // Simple case: horizontal line length from M{x1} {y}L{x2} {y}
    const match = dAttribute.match(/M(\d+(?:\.\d+)?) \d+(?:\.\d+)?L(\d+(?:\.\d+)?) \d+(?:\.\d+)?/);
    if (match) {
        return Math.abs(match[2] - match[1]);
    }
    return 0;
}

function getStaffSystems() {
    const staffLinePaths = document.querySelectorAll('path[fill="none"][stroke]');
    const lengthThreshold = 25; // Arbitrary length threshold for ledger lines
    const systemSpacingThreshold = 30; // Arbitrary threshold for grouping lines; adjust as needed
    const allLines = Array.from(staffLinePaths)
        .map(path => ({
            path,
            yPos: parseFloat(path.getAttribute('d').split(' ')[path.getAttribute('d').split(' ').length - 1]),
            length: getPathLength(path.getAttribute('d'))
        }))
        .filter(line => line.length >= lengthThreshold)
        .sort((a, b) => a.yPos - b.yPos);
    
    const systemsY = [];
    let currentSystem = [];
    let lastYPos = null;

    allLines.forEach(line => {
        if (lastYPos === null || line.yPos - lastYPos < systemSpacingThreshold) {
            if (!(currentSystem.includes(line.yPos))) {
                currentSystem.push(line.yPos);
            }
        } else {
            systemsY.push(currentSystem);
            currentSystem = [line.yPos];
        }
        lastYPos = line.yPos;
    });

    // Add the last system if it has staff lines
    if (currentSystem.length > 0) {
        systemsY.push(currentSystem);
    }

    return systemsY;
}

function getYPositionOfNotehead(noteheadElement) {
    const noteheadPath = noteheadElement.querySelector('path[fill][stroke="none"]');
    const dAttribute = noteheadPath.getAttribute('d');
    const match = /M\d+(?:\.\d+)? (\d+(?:\.\d+)?)/.exec(dAttribute);
    if (match) {
        return parseFloat(match[1]);
    }
    return null; // or some default value if needed
}

function getXPositionOfNotehead(noteheadElement) {
    const noteheadPath = noteheadElement.querySelector('path[fill][stroke="none"]');
    const dAttribute = noteheadPath.getAttribute('d');
    const match = /M(\d+(?:\.\d+)?) \d+(?:\.\d+)?/.exec(dAttribute);
    if (match) {
        return parseFloat(match[1]);
    }
    return null; // or some default value if needed
}

function findNearestXElement(xValue) {
    let allXElements = document.querySelectorAll(".vf-notehead");
    if (currentStaffSystem) {
        allXElements = Array.from(allXElements).filter(notehead => {
            const noteheadY = getYPositionOfNotehead(notehead);
            return Math.min(...currentStaffSystem) - 30 <= noteheadY && noteheadY <= Math.max(...currentStaffSystem) + 30;
        });
    }
    const nearestXElement = Array.from(allXElements).reduce((nearestElement, currentElement) => {
        const currentX = getXPositionOfNotehead(currentElement);
        const nearestX = getXPositionOfNotehead(nearestElement);
        return Math.abs(currentX - xValue) < Math.abs(nearestX - xValue) ? currentElement : nearestElement;
    }, allXElements[0]);
    return nearestXElement;
}

function calculateOffset(xValue) {
    var nearestXElement = findNearestXElement(xValue);
    var nearestM21Element = findNoteInStreamById(scoreStream, nearestXElement.getAttribute("number"));
    if (nearestM21Element === null) {
        return null;
    } else if (isArray(nearestM21Element)) {
        return nearestM21Element[1].offset;
    } else {
        return nearestM21Element.offset; 
    }
}

function calculatePitch(yValue, staffSystem) {
    const referenceLine = staffSystem[0];
    const referencePitch = 'E4';
    const spaceBetweenLines = Math.abs((staffSystem[1] - staffSystem[0]) / 2);

    // Calculate relative Y-position from the top staff line
    const relativeY = Math.round((yValue - referenceLine) / 5) * 5;

    // // Calculate how many spaces/steps the mouse is from the reference line
    const stepsFromReferenceLine = relativeY / spaceBetweenLines;

    const pitch = mapStepsToPitch(referencePitch, stepsFromReferenceLine);

    return pitch;
}

function mapStepsToPitch(referencePitch, stepsFromReferenceLine) {
    const pitchIndex = pitchArray.indexOf(referencePitch);
    const pitch = pitchArray[(pitchIndex - stepsFromReferenceLine) % pitchArray.length];
    return pitch;
}

function isArray(myArray) {
    return myArray.constructor === Array;
}

function m21ToXML(scoreStream) {
    const exporter = new music21.musicxml.m21ToXml.ScoreExporter(scoreStream);
    const updatedMusicXML = exporter.parse();
    const serializer = new XMLSerializer();
    const xmlString = serializer.serializeToString(updatedMusicXML);
    const xmlDeclaration = "<?xml version=\"1.0\" encoding='UTF-8' standalone='no' ?>";
    const doctypeDeclaration = "<!DOCTYPE score-partwise PUBLIC \"-//Recordare//DTD MusicXML 3.0 Partwise//EN\" \"http://www.musicxml.org/dtds/partwise.dtd\">";
    const combinedXML = xmlDeclaration + "\n" + doctypeDeclaration + "\n" + xmlString;
    return combinedXML;
}

function getOSMDIndex(elementId) {
    let foundIndex = null;
    document.querySelectorAll(".vf-notehead").forEach((notehead, index) => {
        if (notehead.getAttribute("number") === elementId) {
            foundIndex = index;
        }
    });
    return foundIndex;
}

function addSVGNoteNumbersAndListeners() {
    const staveNotes = document.querySelectorAll(".vf-stavenote");
    let noteNumber = 1;

    staveNotes.forEach((note) => {
        const noteHeads = note.querySelectorAll(".vf-notehead");
        let chordToneNumber = 1;

        noteHeads.forEach((noteHead) => {
            const tag = `note-${noteNumber}-${chordToneNumber}`;
            noteHead.setAttribute("number", tag);

            noteHead.addEventListener('mousedown', handleStart);
            noteHead.addEventListener('touchstart', handleStart, { passive: false });
            chordToneNumber = chordToneNumber + 1;
        });
        noteNumber = noteNumber + 1;
    });
}

function findNoteInStreamById(stream, noteId) {
    let foundElement = null;
    const allElements = stream.flatten().notesAndRests;
    for (const element of allElements) {
        if (element instanceof music21.note.Note || element instanceof music21.note.Rest) {
            if (element.id === noteId) {
                foundElement = element;
                break;
            }
        } else if (element instanceof music21.chord.Chord) {
            for (const note of element.notes) {
                if (note.id === noteId) {
                    foundElement = [note, element];
                    break;
                }
            }
        }
        if (foundElement) break;
    }
    return foundElement;
}

function assignIdsToNotes(stream) {
    let noteNumber = 1;
    let elements = stream.flatten().notesAndRests;
    for (const element of elements) {
        if (element.classes.includes('Note') || element.classes.includes('Rest')) {
            element.id = `note-${noteNumber}-1`;
            noteNumber = noteNumber + 1;
        } else if (element.classes.includes('Chord')) {
            let chordToneNumber = 1;
            element.notes.forEach((notehead) => {
                notehead.id = `note-${noteNumber}-${chordToneNumber}`;
                chordToneNumber = chordToneNumber + 1;
            });
            noteNumber = noteNumber + 1;
        }
    }
}

function clearIds(stream) {
    let elements = stream.flatten().notes;
    for (const element of elements) {
        if (element.isClassOrSubclass('Note') || element.isClassOrSubclass('Chord')) {
            element.id = undefined;
            if (element.isClassOrSubclass('Chord')) {
                element.notes.forEach((notehead) => {
                    notehead.id = undefined;
                });
            }
        }
    }
}

function removeNote(stream, noteObject) {
    var copyObject;
    var removeObject;
    if (isArray(noteObject)) {
        copyObject = noteObject[1];
        removeObject = noteObject[0];
    } else {
        copyObject = noteObject;
        removeObject = noteObject;
    }

    const objectMeasure = copyObject.getContextByClass('Measure');
    if (objectMeasure) {
        if (isArray(noteObject)) {
            var updatedPitches = copyObject.pitches;
            const removeIndex =updatedPitches.indexOf(removeObject.pitch);
            updatedPitches.splice(removeIndex, 1);
            var newObject;
            if (updatedPitches.length === 1) {
                newObject = new music21.note.Note(updatedPitches[0]);
            } else {
                newObject = new music21.chord.Chord(updatedPitches);
            }
            objectMeasure.replace(copyObject, newObject);
        } else {
            const newRest = new music21.note.Rest();
            newRest.duration.quarterLength = copyObject.duration.quarterLength;
            objectMeasure.replace(removeObject, newRest);
        }
    }
    return stream.makeNotation();
}

function reTargetNote(newNoteId) {
    svgObject = document.querySelector(`[number="${newNoteId}"]`);
    const noteObject = findNoteInStreamById(scoreStream, newNoteId);
    if (noteObject) {
        if (isArray(noteObject)) {
            currentPitch = noteObject[0].pitch.nameWithOctave;
        } else {
            currentPitch = noteObject.pitch.nameWithOctave;
        }
        m21Object = noteObject;
        noteId = newNoteId;
        osmdElementIndex = getOSMDIndex(noteId);
    }
}

function changeOSMDNoteColor(osmdElementIndex, color="#000000") {
    if (osmdElementIndex !== null) {
    const targetNotehead = osmd.rules.NoteToGraphicalNoteMap.getValue(osmdElementIndex)
    targetNotehead.sourceNote.noteheadColor = color;
    }
}

function changeBeat(moveElement, newBeat) {
    if (isArray(moveElement)) {
        var moveNotehead = moveElement[0];
    } else {
        var moveNotehead = moveElement;
    }
    elementsOnNewOffset = scoreStream.flat.getElementsByOffset(newBeat);
    var targetElement = elementsOnNewOffset.get(0);
    var targetMeasure = targetElement.getContextByClass('Measure');

    if (moveNotehead.duration.quarterLength !== targetElement.duration.quarterLength) {
        return;
    }

    if (targetElement.isRest) {
        scoreStream = removeNote(scoreStream, moveElement);
        targetMeasure.replace(targetElement, moveNotehead);
        assignIdsToNotes(scoreStream);
        noteId = moveNotehead.id;

    } else if (targetElement.isChord) {
        var targetChordPitches = targetElement.pitches.map(pitch => pitch.nameWithOctave);
        if (targetChordPitches.includes(moveNotehead.pitch.nameWithOctave)) {
            return;
        }
        scoreStream = removeNote(scoreStream, moveElement);
        var updatedChordPitches = [moveNotehead.pitch.nameWithOctave].concat(targetChordPitches);
        var updatedChord = new music21.chord.Chord(updatedChordPitches);
        updatedChord.sortPitches();
        targetMeasure.replace(targetElement, updatedChord);
        assignIdsToNotes(scoreStream);
        const chordPitches = updatedChord.pitches.map(pitch => pitch.nameWithOctave);
        const NoteIndex = chordPitches.indexOf(moveNotehead.pitch.nameWithOctave);
        noteId = updatedChord.notes[NoteIndex].id;

    } else if (targetElement.isNote && targetElement.pitch.nameWithOctave !== moveNotehead.pitch.nameWithOctave){
        scoreStream = removeNote(scoreStream, moveElement);
        var updatedChord = new music21.chord.Chord([moveNotehead, targetElement]);
        updatedChord.sortPitches();
        targetMeasure.replace(targetElement, updatedChord);
        assignIdsToNotes(scoreStream);
        const chordPitches = updatedChord.pitches.map(pitch => pitch.nameWithOctave);
        const NoteIndex = chordPitches.indexOf(moveNotehead.pitch.nameWithOctave);
        noteId = updatedChord.notes[NoteIndex].id;
    }
}

function changePitch(moveElement, newPitch) {
    if (isArray(moveElement)) {
        let chordPitches = moveElement[1].pitches.map(pitch => pitch.nameWithOctave);
        const prevNoteIndex = chordPitches.indexOf(moveElement[0].pitch.nameWithOctave);
        if (!(chordPitches.includes(newPitch))) {
            moveElement[0].pitch.nameWithOctave = newPitch;
            moveElement[1].sortPitches();
            chordPitches = moveElement[1].pitches.map(pitch => pitch.nameWithOctave);
            assignIdsToNotes(scoreStream);
            if (chordPitches.indexOf(newPitch) !== prevNoteIndex) {
                noteId = moveElement[1].notes[chordPitches.indexOf(newPitch)].id;
            }
        }

    } else {
        moveElement.pitch.nameWithOctave = newPitch;
    }
}

function reRenderScore(score, osmd) {
    const exportedXML = m21ToXML(score);
    scoreStream = music21.converter.parse(exportedXML, 'musicxml');
    assignIdsToNotes(scoreStream);
    osmd.load(exportedXML).then(() => {
        osmd.render();
        let checkRenderComplete = setInterval(function() {
            let renderedElement = document.querySelector('.vf-stavenote');
            if (renderedElement) {
                clearInterval(checkRenderComplete);
                addSVGNoteNumbersAndListeners();
                reTargetNote(noteId);
            }
        }, 5); // milliseconds
    });
    return scoreStream, osmd;
}

function handleStart() {
    isDragging = true;
    noteheadY = getYPositionOfNotehead(this);
    currentStaffSystem = findNearestStaffSystem(noteheadY).reverse();
    svgObject = this;
    noteId = this.getAttribute("number");
    m21Object = findNoteInStreamById(scoreStream, noteId);
    if (m21Object) {
        if (isArray(m21Object)) {
            currentPitch = m21Object[0].pitch.nameWithOctave;
            currentBeat = m21Object[1].offset;
        } else if (m21Object.classes.includes('Note')){
            currentPitch = m21Object.pitch.nameWithOctave;
            currentBeat = m21Object.offset;
        }
    }
    osmdElementIndex = getOSMDIndex(noteId);
    changeOSMDNoteColor(osmdElementIndex, moveNoteHeadColor);
}

function handleMove(event) {
    const currentTime = new Date().getTime();
    if (currentTime - lastCalledTime < delay) {
        return;
    }

    lastCalledTime = currentTime;
    if (isDragging && svgObject) {
        wasDragged = true;
        event.preventDefault(); // Prevent default behavior like scrolling
        let mouseX, mouseY;

        if (event.type === 'mousemove') {
            mouseX = event.pageX - bodyMargin;
            mouseY = event.pageY - bodyMargin;
        } else if (event.type === 'touchmove') {
            mouseX = event.touches[0].pageX - bodyMargin;
            mouseY = event.touches[0].pageY - bodyMargin;
        }

        newBeat = calculateOffset(mouseX, currentStaffSystem);
        newPitch = calculatePitch(mouseY, currentStaffSystem);
        if (pitchArray.indexOf(newPitch) > pitchArray.indexOf('A5') || pitchArray.indexOf(newPitch) < pitchArray.indexOf('A3')) {
            return;
        }

        if (newBeat !== currentBeat && newBeat !== null) {
            m21Object = findNoteInStreamById(scoreStream, noteId);
            changeBeat(m21Object, newBeat);
            scoreStream, osmd = reRenderScore(scoreStream, osmd);
        }

        if (newPitch !== currentPitch && currentPitch !== null) {
            m21Object = findNoteInStreamById(scoreStream, noteId);
            changePitch(m21Object, newPitch);
            scoreStream, osmd = reRenderScore(scoreStream, osmd);
        }

        if (isArray(m21Object)) {
            currentPitch = m21Object[0].pitch.nameWithOctave;
            currentBeat = m21Object[1].offset;
        } else if (m21Object.classes.includes('Note')){
            currentPitch = m21Object.pitch.nameWithOctave;
            currentBeat = m21Object.offset;
        }

        if (getOSMDIndex(noteId) !== null) {
            osmdElementIndex = getOSMDIndex(noteId);
        }
        changeOSMDNoteColor(osmdElementIndex, moveNoteHeadColor);
    }
}

function handleEnd(event) {
    if (event.type === 'touchend' || event.target !== svgObject) {
        prevTouchY = null;
        wasDragged = false;
    }
    isDragging = false;
    osmdElementIndex = null;
    svgObject = null;
    m21Object = null;
    noteId = null;
    currentPitch = null;
    newPitch = null;
    currentBeat = null;
    newBeat = null;
    scoreStream, osmd = reRenderScore(scoreStream, osmd);
}

function handleClick() {
    isDragging = true;
    noteheadY = getYPositionOfNotehead(this);
    currentStaffSystem = findNearestStaffSystem(noteheadY).reverse();
    svgObject = this;
    noteId = this.getAttribute("number");
    m21Object = findNoteInStreamById(scoreStream, noteId);
    if (m21Object) {
        if (isArray(m21Object)) {
            currentPitch = m21Object[0].pitch.nameWithOctave;
            currentBeat = m21Object[1].offset;
        } else if (m21Object.classes.includes('Note')){
            currentPitch = m21Object.pitch.nameWithOctave;
            currentBeat = m21Object.offset;
        }
    }
    osmdElementIndex = getOSMDIndex(noteId);
    changeOSMDNoteColor(osmdElementIndex, moveNoteHeadColor);
}