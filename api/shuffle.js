const TABLES = {
  workflows: "Drawing Workflow",
  workflowSteps: "Workflow Steps",
  palettes: "Color Palettes",
  grids: "Grid Cards",
  motifs: "Motif Cards",
  gridScales: "Grid Scale Cards",
  gridStyles: "Grid Style Cards",
  gridMethods: "Grid Method Cards"
};

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

async function airtableList(tableName) {
  const token = requireEnv("AIRTABLE_TOKEN");
  const baseId = requireEnv("AIRTABLE_BASE_ID");
  let records = [];
  let offset = null;

  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`);
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message || `Airtable error loading ${tableName}`);
    }

    records = records.concat(data.records || []);
    offset = data.offset;
  } while (offset);

  return records;
}

function randomItem(list, label) {
  if (!list || list.length === 0) throw new Error(`No active records found for ${label || "a required table"}.`);
  return list[Math.floor(Math.random() * list.length)];
}

function isActive(record) {
  return !record.fields["Status"] || record.fields["Status"] === "Active";
}

function splitList(value) {
  return String(value || "").split(",").map(function(item) { return item.trim(); }).filter(Boolean);
}

function hasOverlap(record, fieldName, allowedTypes) {
  var recordTypes = splitList(record.fields[fieldName]);
  return allowedTypes.some(function(type) { return recordTypes.indexOf(type) !== -1; });
}

function getFieldText(record, fieldName) {
  return record && record.fields ? String(record.fields[fieldName] || "").trim() : "";
}

function getMotifTypes(record) {
  return splitList(record.fields["Motif Types"]);
}

function getMotifFunction(record) {
  return getFieldText(record, "Motif Function");
}

function functionMatches(record, allowedFunctions) {
  var fn = getMotifFunction(record).toLowerCase();
  return allowedFunctions.some(function(allowed) {
    return fn === String(allowed).toLowerCase();
  });
}

function hasDifferentMotifType(a, b) {
  var aTypes = getMotifTypes(a);
  var bTypes = getMotifTypes(b);
  if (aTypes.length === 0 || bTypes.length === 0) return true;
  return !aTypes.some(function(type) {
    return bTypes.indexOf(type) !== -1;
  });
}

function canBe(record, fieldName) {
  return record.fields[fieldName] === true;
}

function pickMotif(options, fallbackOptions, label) {
  var usable = options.filter(Boolean);
  if (usable.length > 0) return randomItem(usable, label);
  var fallback = fallbackOptions.filter(Boolean);
  return randomItem(fallback, label);
}

export default async function handler(req, res) {
  try {
    const [workflows, grids, motifs, palettes, gridScales, gridStyles, gridMethods, allSteps] = await Promise.all([
      airtableList(TABLES.workflows),
      airtableList(TABLES.grids),
      airtableList(TABLES.motifs),
      airtableList(TABLES.palettes),
      airtableList(TABLES.gridScales),
      airtableList(TABLES.gridStyles),
      airtableList(TABLES.gridMethods),
      airtableList(TABLES.workflowSteps)
    ]);

    var activeWorkflows = workflows.filter(isActive);
    var activeGrids = grids.filter(isActive);
    var activeMotifs = motifs.filter(isActive);
    var activePalettes = palettes.filter(isActive);
    var activeGridScales = gridScales.filter(isActive);
    var activeGridStyles = gridStyles.filter(isActive);
    var activeGridMethods = gridMethods.filter(isActive);

    var workflow = randomItem(activeWorkflows, TABLES.workflows);
    var grid = randomItem(activeGrids, TABLES.grids);
    var secondGrid = null;

    if (workflow.fields["Workflow Name"] === "Layered Grids") {
      var secondGridOptions = activeGrids.filter(function(g) {
        return g.id !== grid.id;
      });
      secondGrid = randomItem(secondGridOptions, "second grid");
    }

    var palette = randomItem(activePalettes, TABLES.palettes);
    var gridScale = randomItem(activeGridScales, TABLES.gridScales);
    var gridStyle = randomItem(activeGridStyles, TABLES.gridStyles);
    var gridMethod = randomItem(activeGridMethods, TABLES.gridMethods);

    var gridMotifTypes = splitList(grid.fields["Motif Compatibility"]);
    var compatibleMotifs = activeMotifs.filter(function(motif) {
      return hasOverlap(motif, "Motif Types", gridMotifTypes);
    });
    if (compatibleMotifs.length === 0) compatibleMotifs = activeMotifs;

    var allHeroOptions = compatibleMotifs.filter(function(motif) {
      return canBe(motif, "Can Be Hero");
    });
    if (allHeroOptions.length === 0) {
      allHeroOptions = activeMotifs.filter(function(motif) {
        return canBe(motif, "Can Be Hero");
      });
    }

    var heroOptions = allHeroOptions.filter(function(motif) {
      return functionMatches(motif, ["Focal", "Hero", "Focal Point"]);
    });
    var hero = pickMotif(heroOptions, allHeroOptions, "hero motif");

    var allSecondaryOptions = compatibleMotifs.filter(function(motif) {
      return motif.id !== hero.id && canBe(motif, "Can Be Secondary");
    });
    if (allSecondaryOptions.length === 0) {
      allSecondaryOptions = activeMotifs.filter(function(motif) {
        return motif.id !== hero.id && canBe(motif, "Can Be Secondary");
      });
    }

    var secondaryOptions = allSecondaryOptions.filter(function(motif) {
      return functionMatches(motif, ["Connector", "Movement", "Secondary", "Supporting"]) &&
        hasDifferentMotifType(motif, hero);
    });
    if (secondaryOptions.length === 0) {
      secondaryOptions = allSecondaryOptions.filter(function(motif) {
        return hasDifferentMotifType(motif, hero);
      });
    }
    var secondary = pickMotif(secondaryOptions, allSecondaryOptions, "secondary motif");

    var allTertiaryOptions = compatibleMotifs.filter(function(motif) {
      return motif.id !== hero.id &&
        motif.id !== secondary.id &&
        canBe(motif, "Can Be Tertiary");
    });
    if (allTertiaryOptions.length === 0) {
      allTertiaryOptions = activeMotifs.filter(function(motif) {
        return motif.id !== hero.id &&
          motif.id !== secondary.id &&
          canBe(motif, "Can Be Tertiary");
      });
    }

    var tertiaryOptions = allTertiaryOptions.filter(function(motif) {
      return functionMatches(motif, ["Filler", "Texture", "Detail"]);
    });
    if (tertiaryOptions.length === 0) {
      tertiaryOptions = allTertiaryOptions.filter(function(motif) {
        return hasDifferentMotifType(motif, hero) && hasDifferentMotifType(motif, secondary);
      });
    }
    var tertiary = pickMotif(tertiaryOptions, allTertiaryOptions, "tertiary motif");

    var workflowSteps = allSteps.filter(function(step) {
      var linked = step.fields["Workflow"] || [];
      return linked.indexOf(workflow.id) !== -1 && isActive(step);
    });

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      workflow,
      workflowSteps,
      grid,
      secondGrid,
      gridScale,
      gridStyle,
      gridMethod,
      hero,
      secondary,
      tertiary,
      palette
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Error generating shuffle." });
  }
}
