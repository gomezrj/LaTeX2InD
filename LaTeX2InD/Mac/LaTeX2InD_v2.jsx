// LaTeX2InD Script
#targetengine "session"

function checkMissingLinks (document){
    // Checks if there are missing links in the document (such as pdf equations)
    var statusString = document.links.everyItem().status.toString();
    if ( statusString.indexOf ("LINK_MISSING") !== -1){
        return -1;
    }
    return 0;
}
// Returns -1 on missing links and 0 if it's all fine

function GetFileName(file) {
    // Eats up a file and spits out the name of it
    pathOfFile = file.getRelativeURI();
    lastSlash = pathOfFile.lastIndexOf("/"); //This will get the index of the / just after .../equations/
    filename = pathOfFile.substring(lastSlash+1);
    filename = filename.replace(".pdf","");
	return filename;
}
// Returns the name of the file

function setDirectories(document){
    // First checks if the file actually has been saved and it has a folder where it's saved
    try {
        if (document.fullName){}; //This simply checks if the document exists somewhere
    }catch(e){
        return -1;
    }
    // Now it checks for a folder inside called equations
    var documentPath = document.filePath;
    documentPath += "/";
    var equationsPath = documentPath+"equations";
    var equationsFolder = new Folder(equationsPath);
    // If it exists, perfect, if not, it creates it
    if(!equationsFolder.exists){
        equationsFolder.create();
    }
    // Finally returns the path of the document file
    return documentPath;
}
// Returns -1 if there is no document or the path to the document

function scanEquations(path){
    // First check if the equation folder exists
    var equationsFolder = new Folder(path+"equations/");
    if (!equationsFolder.exists){
        return -1;
    }
    // If it does, make a list with them
    var listOfEquations = equationsFolder.getFiles("*.pdf");
    // If the list is empty, return it
    if (listOfEquations.length < 1){
        return listOfEquations;
    }
    // Otherwise we trim the names and return the list
    var newListOfEquations = new Array(listOfEquations.length);
    for (i=0; i < listOfEquations.length; i++){
        newListOfEquations[i] = GetFileName(listOfEquations[i]);
    }

    return newListOfEquations;
}
// Returns -1 if there's no equations folder and a list of the names of the equations otherwise

function createCompiler(filename,path,compilerName){
    // Create the compiler
    var appleScript = new File(path+"compile.applescript");
    appleScript.open('w');
    var line = "cd && cd "+path+"equations/ && /Library/TeX/texbin/"+compilerName+" -halt-on-error " +filename+ ".tex";
    var compileLine = "do shell script \""+line+"\"";
    appleScript.write(compileLine);
    appleScript.close();
    return;
}
// Creates the compilers and returns nothing

function gatherLatex(latexCode,nameOfFile,fontsize,path,compilerName){
    // First, check if the name is empty and if so rename to equation
    var fixedNameOfFile = nameOfFile;
    if(nameOfFile===""){
        fixedNameOfFile = "equation";
    }
    // Now check file name for duplicates and rename them to the date if they exist
    var pdfFile = new File(path+"equations/"+fixedNameOfFile+".pdf");
    var texFile = new File(path+"equations/"+fixedNameOfFile+".tex");
    var filename = fixedNameOfFile;
    if (pdfFile.exists){
        const date = new Date();
        const year = date.getFullYear();
        const month = date.getMonth();
        const day = date.getDate();
        const hour = date.getHours();
        const minute = date.getMinutes();
        const secs = date.getSeconds();
        filename = fixedNameOfFile+"_"+year+"_"+month+"_"+day+"_"+hour+"_"+minute+secs;
        texFile = new File(path+"equations/"+filename+".tex");
    }
    // Detect the optional preamble file
    var preamble = new File (path+"equations/macros.tex");
    var inputPreamble ="";
    if (preamble.exists){
        inputPreamble="\\input{macros.tex} \n";
    }
    // Extract text into latexContent variable to make the .tex file
    var latexContent = latexCode.text;
    var texPreamble = "\\documentclass[varwidth=true,border={1pt 1pt 1pt 2pt}]{standalone} \n \\usepackage{amsmath,amssymb,amsfonts} \n\\usepackage[fontsize="+fontsize+"]{fontsize} \n" +inputPreamble+ "\\pagestyle{empty} \n \\begin{document} \n";
    var texClosing = "\n \\end{document}";
    texFile.encoding = 'UTF-8';
    texFile.open('w');
    texFile.write(texPreamble + latexContent + texClosing);
    texFile.close();
    // Now create the compiler and vbs file and execute it to create the equations
    createCompiler(filename,path,compilerName);
    var appleScript = new File(path+"compile.applescript");
    app.doScript(appleScript,ScriptLanguage.APPLESCRIPT_LANGUAGE,[],);
    appleScript.close();

    return filename;
}
// Gives the instruction to create the files

function placeLatex(page,layer,filename,path,wrapsetting,wrapsetting_array){
    // Fetch pdf into pdfFile
    var pdfFile = new File(path+"equations/"+filename+".pdf");
    var errorFile = new File(path+"equations/"+filename+"\_error.txt");
    // We need to wait for the compiler to work its magic
    var counter = 0;
    var maxcounter = 200; // Max time is 20 seconds
    while (!errorFile.exists && !pdfFile.exists && (counter.valueOf() <= maxcounter.valueOf())){
        counter++;
        $.sleep(100);
    }
    if(errorFile.exists){
        alert('Wrong LaTeX input! Check '+filename+'.log for the error and '+filename+'.tex for the LaTeX code.');
        return -1;
    }
    if(counter.valueOf() > maxcounter.valueOf()){
        alert("Compilation time exceeded, consider splitting your LaTeX code into smaller pieces.");
        return -2;
    }
    $.sleep(70);
    // We place the equation
    var placedEquation;
    var placedEquationFrame;
    placedEquation = page.place(pdfFile,[0,0],layer)[0];
    placedEquationFrame = placedEquation.parent;
    // We set its wrap-around-text properties
    placedEquationFrame.textWrapPreferences.textWrapMode = wrapsetting;
    placedEquationFrame.textWrapPreferences.textWrapOffset = wrapsetting_array;
    placedEquationFrame.textWrapPreferences.textWrapSide = TextWrapSideOptions.BOTH_SIDES;
    return 1;
}
// Waits and places the equation. Returns 1 upon success and -1 upon failure

function cleanFiles(filename,path,keepAux,keepLog,keepTex){
    var appleScript = new File(path+"compile.applescript");
    var auxFile = new File(path+"equations/"+filename+".aux");
    var logFile = new File(path+"equations/"+filename+".log");
    var texFile = new File(path+"equations/"+filename+".tex");
    var errorFile = new File(path+"equations/"+filename+"_error.txt");

    if (appleScript.exists){
        appleScript.remove();
    }
    if (texFile.exists && !keepTex){
        texFile.remove();
    }
    if (auxFile.exists && !keepAux){
        auxFile.remove();
    }
    if (errorFile.exists){
        errorFile.remove();
    }else if(!keepLog){
        logFile.remove();
    }

    return;
}
// Clears undesired and unnecesary files
// NEED TO CLEAR THE APPLESCRIPT

function addExistingEquation (nameOfEquation,path,page,layer,wrapsetting,wrapsetting_array) {
    pdfFile = new File(path+"equations/"+nameOfEquation+".pdf");
    if (!pdfFile.exists){
        alert('Selected file is inexistent, it may have been deleted.');
        return -1;
    }
    // We place the equation
    var placedEquation;
    var placedEquationFrame;
    placedEquation = page.place(pdfFile,[0,0],layer)[0];
    placedEquationFrame = placedEquation.parent;
    // We set its wrap-around-text properties
    placedEquationFrame.textWrapPreferences.textWrapMode = wrapsetting;
    placedEquationFrame.textWrapPreferences.textWrapOffset = wrapsetting_array;
    placedEquationFrame.textWrapPreferences.textWrapSide = TextWrapSideOptions.BOTH_SIDES;
    pdfFile.close();
    return 0;
}
// Places an existing equation from the equations folder. Returns -1 if the pdf does not exist and 0 if the equation was added

function LaTeX2InD() {
    // Fetch the document, page and layer data to place equation
    var document = app.activeDocument;
    var page = document.layoutWindows[0].activePage;
    var layer = document.layoutWindows[0].activeLayer;
    var wrapsetting = TextWrapModes.NONE;

    // Check if the document has a folder where it's saved
    var docDirectory = setDirectories(document);
    if(docDirectory === -1){
        alert("Document has not yet been saved! Save it and try again.");
        return;
    }
    // Check if there are missing equations
    if (checkMissingLinks(document)===-1){
        alert ("Document has missing files! Fix them and try again.");
        return;
    }
    // If the palette can be opened, we set up an event listener on deactivation of the active document - the handler is specified at the bottom
    app.addEventListener('beforeDeactivate',beforeDeactivateHandler);
    // We scan for the existing equations
    var listOfEquations = scanEquations(docDirectory);

    // UI
    // PALETTE
    // =======
    var palette = new Window("palette", "LaTeX2InD", undefined, {closeButton: false});
    palette.orientation = "row";
    palette.alignChildren = ["center","center"];
    palette.spacing = 10;
    palette.margins = 16;

    // INPUT
    // =====
    var Input = palette.add("group", undefined, {name: "Input"});
    Input.orientation = "column";
    Input.alignChildren = ["left","center"];
    Input.spacing = 10;
    Input.margins = 0;

    var Instructions = Input.add("statictext", undefined, undefined, {name: "Instructions"});
    Instructions.text = "Write your LaTeX code in the box below:";

    var latexCode = Input.add('edittext {properties: {name: "IatexCode", multiline: true, wantReturn:true}}');
    latexCode.preferredSize.width = 320;
    latexCode.preferredSize.height = 480;
    latexCode.active = true;

    // OPTIONS
    // =======
    var Options = palette.add("group", undefined, {name: "Options"});
    Options.orientation = "column";
    Options.alignChildren = ["left","center"];
    Options.spacing = 10;
    Options.margins = 0;

    // CREATEEQUATION
    // ==============
    var CreateEquation = Options.add("panel", undefined, undefined, {name: "CreateEquation"});
    CreateEquation.text = "Create new file";
    CreateEquation.orientation = "column";
    CreateEquation.alignChildren = ["left","top"];
    CreateEquation.spacing = 10;
    CreateEquation.margins = 10;

    // INPUTEQUATIONNAME
    // =================
    var InputEquationName = CreateEquation.add("group", undefined, {name: "InputEquationName"});
    InputEquationName.orientation = "row";
    InputEquationName.alignChildren = ["left","center"];
    InputEquationName.spacing = 10;
    InputEquationName.margins = 0;

    var NameInstructions = InputEquationName.add("statictext", undefined, undefined, {name: "NameInstructions"});
    NameInstructions.text = "Name:";

    var nameEquation = InputEquationName.add('edittext {properties: {name: "NameEquation"}}');
    nameEquation.preferredSize.width = 166;

    // FONTSIZEEQUATION
    // ================
    var FontsizeEquation = CreateEquation.add("group", undefined, {name: "FontsizeEquation"});
    FontsizeEquation.orientation = "row";
    FontsizeEquation.alignChildren = ["left","center"];
    FontsizeEquation.spacing = 10;
    FontsizeEquation.margins = 0;

    var FontsizeInstructions = FontsizeEquation.add("statictext", undefined, undefined, {name: "FontsizeInstructions"});
    FontsizeInstructions.text = "Fontsize: ";

    var Fontsize_array = ["10pt","11pt","12pt","14pt","16pt","18pt","20pt","24pt","26pt","30pt","36pt","42pt","48pt","60pt","72pt"];
    var fontSize = FontsizeEquation.add("dropdownlist", undefined, undefined, {name: "Fontsize", items: Fontsize_array});
    fontSize.selection = 2;

    // COMPILER
    // ========
    var Compiler = CreateEquation.add("group", undefined, {name: "Compiler"});
    Compiler.orientation = "column";
    Compiler.alignChildren = ["left","center"];
    Compiler.spacing = 10;
    Compiler.margins = 0;

    // GROUP1
    // ======
    var group1 = Compiler.add("group", undefined, {name: "group1"});
    group1.orientation = "row";
    group1.alignChildren = ["left","center"];
    group1.spacing = 10;
    group1.margins = 0;

    var CompilerSelection = group1.add("statictext", undefined, undefined, {name: "CompilerSelection"});
    CompilerSelection.text = "Compiler:";

    var compilerName_array = ["pdflatex","xelatex","lualatex"];
    var compilerName = group1.add("dropdownlist", undefined, undefined, {name: "CompilerDropdown", items: compilerName_array});
    compilerName.selection = 0;



    // SUBOPTIONS
    // ==========
    var subOptions = CreateEquation.add("group", undefined, {name: "subOptions"});
    subOptions.orientation = "row";
    subOptions.alignChildren = ["right","center"];
    subOptions.spacing = 10;
    subOptions.margins = 0;
    subOptions.alignment = ["fill","top"];

    // FILEREMOVAL
    // ===========
    var fileRemoval = subOptions.add("group", undefined, {name: "fileRemoval"});
    fileRemoval.orientation = "column";
    fileRemoval.alignChildren = ["left","center"];
    fileRemoval.spacing = 10;
    fileRemoval.margins = [0,0,20,0];

    var keepAuxCheckbox = fileRemoval.add("checkbox", undefined, undefined, {name: "keepAux"});
    keepAuxCheckbox.text = "Generate aux file";

    var keepLogCheckbox = fileRemoval.add("checkbox", undefined, undefined, {name: "keepLog"});
    keepLogCheckbox.text = "Generate log file";

    var keepTexCheckbox = fileRemoval.add("checkbox", undefined, undefined, {name: "keepTex"});
    keepTexCheckbox.text = "Generate tex file";

    // CREATEEQUATIONBUTTON
    // ====================
    var CreateEquationButton = subOptions.add("group", undefined, {name: "CreateEquationButton"});
    CreateEquationButton.orientation = "row";
    CreateEquationButton.alignChildren = ["left","center"];
    CreateEquationButton.spacing = 10;
    CreateEquationButton.margins = 0;

    var createButton = CreateEquationButton.add("button", undefined, undefined, {name: "CreateButton"});
    createButton.text = "Create";
    createButton.preferredSize.width = 67;
    createButton.alignment = ["left","center"];

    // ADDEQUATION
    // ===========
    var AddEquation = Options.add("panel", undefined, undefined, {name: "AddEquation"});
    AddEquation.text = "Add existing";
    AddEquation.orientation = "column";
    AddEquation.alignChildren = ["left","top"];
    AddEquation.spacing = 10;
    AddEquation.margins = 10;
    AddEquation.alignment = ["fill","center"];
    AddEquation.add("statictext", undefined, "Choose existing file:", {name: "statictext1"});


    var selectEquation = AddEquation.add("dropdownlist", undefined, listOfEquations, {name: "EquationSelector"});
    selectEquation.preferredSize.width = 190;

    var addButton = AddEquation.add("button", undefined, undefined, {name: "AddButton"});
    addButton.text = "Add";
    addButton.preferredSize.width = 67;
    addButton.alignment = ["right","top"];

    // WRAP AROUND TEXT
    // ==============
    var WrapAroundText = Options.add("panel", undefined, undefined, {name: "WrapAroundText"});
    WrapAroundText.text = "Text Wrap";
    WrapAroundText.orientation = "column";
    WrapAroundText.alignChildren = ["left","top"];
    WrapAroundText.spacing = 10;
    WrapAroundText.margins = 10;
    WrapAroundText.alignment = ["fill","center"];

    var WrapModes = WrapAroundText.add("group",undefined, {name: "WrapModesOptions"});
    var WrapModesSelectorText = WrapModes.add("statictext", undefined, undefined, {name: "WrapModesSelectorText"});
    WrapModesSelectorText.text="Wrap settings: ";
    var WrapModesSelector_array = ["No wrap","Bounding box","Jump object"];
    var WrapModesSelector = WrapModes.add("dropdownlist", undefined, WrapModesSelector_array, {name: "WrapModesSelector"});
    WrapModesSelector.selection = 0;

    var WrapMargins = WrapAroundText.add("group",undefined, {name: "WrapMarginsOptions"});
    WrapMargins.orientation = "column";

    var WrapMarginsGroup1 = WrapMargins.add("group",undefined, {name:"WrapMarginsGroup1"});
    var WrapMarginsTopText = WrapMarginsGroup1.add("statictext", undefined, undefined, {name:"WrapMarginsTopText"});
    WrapMarginsTopText.text = "T";
    var WrapMarginTop = WrapMarginsGroup1.add('edittext {properties: {name: "WrapMarginTop"}}');
    WrapMarginTop.characters = 5;
    //WrapMarginTop.text = "0 mm";
    var WrapMarginsLeftText = WrapMarginsGroup1.add("statictext", undefined, undefined, {name:"WrapMarginsLeftText"});
    WrapMarginsLeftText.text = "L";
    var WrapMarginLeft = WrapMarginsGroup1.add('edittext {properties: {name: "WrapMarginTop"}}');
    WrapMarginLeft.characters = 5;
    //WrapMarginLeft.text = "0 mm";
    var WrapMarginsGroup2 = WrapMargins.add("group",undefined, {name:"WrapMarginsGroup2"})
    var WrapMarginsBottomText = WrapMarginsGroup2.add("statictext", undefined, undefined, {name:"WrapMarginsBottomText"});
    WrapMarginsBottomText.text = "B";
    var WrapMarginBottom = WrapMarginsGroup2.add('edittext {properties: {name: "WrapMarginTop"}}');
    WrapMarginBottom.characters = 5;
    //WrapMarginBottom.text = "0 mm";
    var WrapMarginsRightText = WrapMarginsGroup2.add("statictext", undefined, undefined, {name:"WrapMarginsRightText"});
    WrapMarginsRightText.text = "R";
    var WrapMarginRight = WrapMarginsGroup2.add('edittext {properties: {name: "WrapMarginTop"}}');
    WrapMarginRight.characters = 5;
    //WrapMarginRight.text = "0 mm";

    var DefaultWrapMargins = ["-2mm","1mm","-2mm","1mm"];
    WrapMarginTop.enabled = false;
    WrapMarginLeft.enabled = false;
    WrapMarginRight.enabled = false;
    WrapMarginBottom.enabled = false;
    WrapModesSelector.onChange = function(){
        if(WrapModesSelector.selection != 0){
            WrapMarginTop.enabled = true;
            WrapMarginLeft.enabled = true;
            WrapMarginRight.enabled = true;
            WrapMarginBottom.enabled = true;
        }
        else{
            WrapMarginTop.enabled = false;
            WrapMarginLeft.enabled = false;
            WrapMarginRight.enabled = false;
            WrapMarginBottom.enabled = false;
        }
        return;
    }



    // CLOSEBUTTON
    // ===========
    var CloseButtonGroup = Options.add("group", undefined, {name: "CloseButtonGroup"});
    CloseButtonGroup.orientation = "row";
    CloseButtonGroup.alignChildren = ["right","center"];
    CloseButtonGroup.spacing = 10;
    CloseButtonGroup.margins = [0,0,10,0];
    CloseButtonGroup.alignment = ["right","center"];

    var closeButton = CloseButtonGroup.add("button", undefined, undefined, {name: "CloseButton"});
    closeButton.text = "Close";
    closeButton.preferredSize.width = 67;
    closeButton.alignment = ["right","bottom"];

    palette.center();
    palette.show();


    closeButton.onClick = function() {
        // Close the palette and remove the event listener
        app.removeEventListener('beforeDeactivate',beforeDeactivateHandler);
        palette.close();
        return;
    }

    addButton.onClick = function() {
        // Update the active document, page and layer
        page = document.layoutWindows[0].activePage;
        layer = document.layoutWindows[0].activeLayer;
        // If no equation is selected we stop
        if (selectEquation.selection===null){
            alert('No file was selected');
            // Reset buttons
            addButton.active = true;
            addButton.active = false;
            return;
        }
        // Now accommodate the wrapping
        var wrapsetting_array = DefaultWrapMargins;
        if((!!WrapMarginTop.text) || (!!WrapMarginLeft.text) || (!!WrapMarginBottom.text) || (!!WrapMarginRight.text)){ //Checks that one is not null and substitutes the null inputs by zero
            var AuxiliarWrapSetting_array = [WrapMarginTop.text, WrapMarginLeft.text, WrapMarginBottom.text, WrapMarginRight.text];
            for(i = 0; i < 4; i++){
                if(!! AuxiliarWrapSetting_array[i]){}
                else{
                    AuxiliarWrapSetting_array[i] = "0mm";
                }
            }
            wrapsetting_array = AuxiliarWrapSetting_array;
        }
        if(WrapModesSelector.selection==1){
            wrapsetting = TextWrapModes.BOUNDING_BOX_TEXT_WRAP;
        }
        else if(WrapModesSelector.selection==2){
            wrapsetting = TextWrapModes.JUMP_OBJECT_TEXT_WRAP;
        }
        // If the equation has been removed or deleted we remove it from the list - this makes it unnecessary to look for missing links
        if(addExistingEquation(selectEquation.selection.text,docDirectory,page,layer,wrapsetting,wrapsetting_array) === -1){
            selectEquation.remove(selectEquation.selection.text);
        }
        // Reset buttons
        addButton.active = true;
        addButton.active = false;
        // Erase the text boxes
        latexCode.text = "";
        nameEquation.text = "";

        // Update the palette
        palette.show();
        return;
    }

    createButton.onClick = function() {
        // Update the active document, page and layer
        page = document.layoutWindows[0].activePage;
        layer = document.layoutWindows[0].activeLayer;
        // Check for missing links - this avoids a problem of having a name associated to two different files
        if (checkMissingLinks(document)===-1){
            alert ("Document has missing files! Fix them and try again.");
            app.removeEventListener('beforeDeactivate',beforeDeactivateHandler);
            palette.close();
            return;
        }
        // Check if latex code is not empty
        if(latexCode.text===""){
            alert('Empty code introduced.');
            // Reset buttons
            createButton.active = true;
            createButton.active = false;
            // When I do this I would like to erase the text that the user has input
            latexCode.text = "";
            nameEquation.text = "";

            // We update the window
            palette.show();
            return;
        }
        // Check and set equations folder, extra files, font size and name of equation
        docDirectory = setDirectories(document);
        var filename = nameEquation.text.replace(/ /g,"_");
        filename = filename.replace(/ /g,"_");
        var fontsize = fontSize.selection.text;
        var keepAux = keepAuxCheckbox.value;
        var keepLog = keepLogCheckbox.value;
        var keepTex = keepTexCheckbox.value;
        // Now accommodate the wrapping
        var wrapsetting_array = DefaultWrapMargins;
        if((!!WrapMarginTop.text) || (!!WrapMarginLeft.text) || (!!WrapMarginBottom.text) || (!!WrapMarginRight.text)){ //Checks that one is not null and substitutes the null inputs by zero
            var AuxiliarWrapSetting_array = [WrapMarginTop.text, WrapMarginLeft.text, WrapMarginBottom.text, WrapMarginRight.text];
            for(i = 0; i < 4; i++){
                if(!! AuxiliarWrapSetting_array[i]){}
                else{
                    AuxiliarWrapSetting_array[i] = "0mm";
                }
            }
            wrapsetting_array = AuxiliarWrapSetting_array;
        }
        if(WrapModesSelector.selection==1){
            wrapsetting = TextWrapModes.BOUNDING_BOX_TEXT_WRAP;
        }
        else if(WrapModesSelector.selection==2){
            wrapsetting = TextWrapModes.JUMP_OBJECT_TEXT_WRAP;
        }

        // Create and place the equation
        var latexWasPlaced = 0;
        filename = gatherLatex(latexCode,filename,fontsize,docDirectory,compilerName.selection.text);
        latexWasPlaced = placeLatex(page,layer,filename,docDirectory,wrapsetting,wrapsetting_array);
        cleanFiles(filename,docDirectory,keepAux,keepLog,keepTex);

        // Now update the dropdown
        var alreadyInList = false;
        if(selectEquation.find(filename) != null){
            alreadyInList = true; // This can happen if equations are deleted mid execution
        }
        if (latexWasPlaced === 1 && !alreadyInList){
            selectEquation.add("Item",filename);
        }
        // Reset buttons
        createButton.active = true;
        createButton.active = false;
        // Erase the text boxes
        latexCode.text = "";
        nameEquation.text = "";

        // Update the palette
        palette.show();

        return;
    }

    // The handler will take care of setting the directories up and updating the dropdown list
    function beforeDeactivateHandler(){
        document = app.activeDocument;
        page = document.layoutWindows[0].activePage;
        layer = document.layoutWindows[0].activeLayer;

        docDirectory = setDirectories(document);
        listOfEquations = scanEquations(docDirectory);
        selectEquation.removeAll();
        var i=0;
        for(i=0; i < listOfEquations.length; i++){
            selectEquation.add("Item",listOfEquations[i]);
        }
        palette.show();

        return;
    }
}

LaTeX2InD();


// COMMENTS

// 1. This is only valid in Windows, since the executable file is a .bat and we also call a .vbs
// 2. Dockability of the palette would be great
// 3. If equations are deleted while the palette is open, the dropdown selector for equations is not updated in real time
//      This is only the case when the document becomes inactive at some point - otherwise the event handler takes care. On
//      that note, a palette.onClose() could work but it didn't for me
