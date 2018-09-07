const sketch = require("sketch/dom");
const UI = require("sketch/ui");
const chartTypes = [
  "arc",
  "arc-spider",
  "lollipop",
  "lollipop-horizontal",
  "line",
  "dotplot",
  "slope",
  "flow-arrows",
  "stackedBar",
  "stackedBar-labelOnTop",
  "stackedBar-column",
  "groupedBar",
  "groupedBar-labelOnTop",
  "groupedBar-column",
  "stackedBar-mekko",
  "waffleplot",
  "treemap",
  "area",
  "area-line",
  "scatterplot",
  "timeline"
];

export default function(context) {
  const selectedLayers = context.selection;
  const selectedCount = selectedLayers.length;
  const document = require("sketch/dom").getSelectedDocument();

  // borrowed from https://github.com/bomberstudios/Cleanup-Useless-Groups
  function unrollGroupsInLayer(layer) {
    log("unrollGroupsInLayer: " + layer);
    if (
      layer.className() == "MSLayerGroup" ||
      layer.className() == "MSArtboardGroup" ||
      layer.className() == "MSSymbolMaster"
    ) {
      if (layer.layers().count() == 0) {
        // This is an empty group, kill it with 🔥
        layer.removeFromParent();
      }
      if (
        layer.layers().count() == 1 &&
        layer
          .layers()
          .firstObject()
          .className() == "MSLayerGroup"
      ) {
        // Group contains just another group, so let's ungroup and call ourselves again
        layer
          .layers()
          .firstObject()
          .ungroup();
        unrollGroupsInLayer(layer);
      } else {
        var layers = layer.layers();
        for (var i = 0; i < layers.length; i++) {
          var layer = layers[i];
          if (layer.className() == "MSLayerGroup") {
            unrollGroupsInLayer(layer);
          }
        }
      }
    }
  }

  // inspired by https://github.com/tankxu/svg-insert
  function doInsertSVG(svgCode, layer, plotConfig) {
    const frame = layer.frame;
    const name = layer.name.split("|||||MASTERLAYER|||||")[0].trim(); // ensure original name
    const svgString = NSString.stringWithString(svgCode);
    const svgData = svgString.dataUsingEncoding(NSUTF8StringEncoding);
    const svgImporter = MSSVGImporter.svgImporter();
    svgImporter.prepareToImportFromData(svgData);
    const importedLayer = svgImporter.importAsLayer();
    unrollGroupsInLayer(importedLayer);
    const svgLayer = sketch.fromNative(importedLayer);
    layer.name = `${name} |||||MASTERLAYER||||| ${svgLayer.id}`;
    svgLayer.name = `${name}'s SVG Layer |||||SLAVEGROUP||||| ${JSON.stringify(
      plotConfig
    )}`;
    svgLayer.frame.x = frame.x;
    svgLayer.frame.y = frame.y;
    context.document.currentPage().addLayers([importedLayer]);
    context.document.showMessage(`🎉 SVG inserted!`);
  }

  function loadChart({
    chartType,
    data,
    signalSettings,
    width,
    height,
    style
  }) {
    const body = JSON.stringify({
      data: data,
      signalSettings: signalSettings,
      width: width,
      height: height
    });
    // UI.alert(
    //   "NOW FETCHING",
    //   `https://sue.st.nzz.ch/chart/${style}/${chartType} with this body: ${body}`
    // );
    return fetch(`https://sue.st.nzz.ch/chart/${style}/${chartType}`, {
      method: "POST",
      body: body,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      }
    })
      .then(res => {
        if (!res.ok || res.status !== 200) {
          throw res.statusText;
        }
        return res.json();
      })
      .then(res => {
        if (res.error === undefined) {
          return res.svg;
        } else {
          throw res.error;
        }
      })
      .catch(e => context.document.showMessage(e));
  }

  if (selectedCount !== 1) {
    context.document.showMessage(
      "Select a Rectangle to convert it to a Sue Chart."
    );
  } else {
    const layer = sketch.fromNative(selectedLayers[0]);
    const masterLayerChunks = layer.name.split("|||||MASTERLAYER|||||");
    const isMasterLayer = masterLayerChunks.length === 2;

    let plotConfig = {};
    if (isMasterLayer) {
      const slaveGroupId = masterLayerChunks[1].slice(1);
      const slaveGroup = document.getLayerWithID(slaveGroupId);
      UI.message("SLAVE: " + slaveGroup);
      if (!slaveGroup) {
        UI.message("Slave group got lost...");
        return;
      }
      plotConfig = JSON.parse(
        slaveGroup.name.split("|||||SLAVEGROUP|||||")[1].slice(1)
      );
      slaveGroup.remove();
      UI.message("resizing slave group");
    } else {
      const chartSelection = UI.getSelectionFromUser(
        "What chart would you like to generate?",
        chartTypes
      );
      const ok = chartSelection[2];
      const chartType = chartTypes[chartSelection[1]];
      if (!ok) {
        UI.message("Bye! Next time!");
      }

      let data = UI.getStringFromUser(
        "What's your data? Paste in TSV data from Excel or co, please.",
        `Monate	Werte 2012	Werte 2014\n1	43	91\n2	81	53\n3	19	87\n4	52	48`
      );
      data = data.split("\n").map(row => row.split("\t"));

      plotConfig = {
        data: data,
        chartType: chartType,
        style: "online",
        signalSettings: {
          sue___automatedHeight: false,
          sue___heightPerStep: 150
        }
      };
    }

    // read dimensions of layer
    const frame = layer.frame;
    const width = frame.width;
    const height = frame.height;
    plotConfig.width = width;
    plotConfig.height = height;

    loadChart(plotConfig).then(svg => {
      doInsertSVG(svg, layer, plotConfig);
    });
  }
}
