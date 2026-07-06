package com.bikemaps;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import com.graphhopper.GraphHopper;
import com.graphhopper.GraphHopperConfig;
import com.graphhopper.jackson.Jackson;

import java.io.File;

/**
 * Import del grafo con gli encoded value custom fun_*.
 * Sostituisce "java -jar graphhopper-web.jar import config.yml" (che non
 * conosce i nostri EV). Il server resta quello ufficiale: al load gli EV
 * sono ricostruiti dalle properties della cache (EncodingManager.fromProperties).
 *
 * Uso: java -cp "graphhopper-web-11.0.jar;ext/classes" com.bikemaps.FunScoreImport config.yml
 */
public class FunScoreImport {
    public static void main(String[] args) throws Exception {
        String configPath = args.length > 0 ? args[0] : "config.yml";
        ObjectMapper yaml = Jackson.initObjectMapper(new ObjectMapper(new YAMLFactory()));
        JsonNode root = yaml.readTree(new File(configPath));
        JsonNode gh = root.get("graphhopper");
        if (gh == null)
            throw new IllegalArgumentException("sezione 'graphhopper' mancante in " + configPath);
        GraphHopperConfig cfg = yaml.treeToValue(gh, GraphHopperConfig.class);

        GraphHopper hopper = new GraphHopper();
        hopper.setImportRegistry(new FunImportRegistry());
        hopper.init(cfg);
        hopper.importAndClose();
        System.out.println("FUN_IMPORT_OK");
    }
}
