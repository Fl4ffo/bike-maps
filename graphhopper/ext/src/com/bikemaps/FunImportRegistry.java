package com.bikemaps;

import com.graphhopper.routing.ev.DefaultImportRegistry;
import com.graphhopper.routing.ev.ImportRegistry;
import com.graphhopper.routing.ev.ImportUnit;
import com.graphhopper.routing.ev.IntEncodedValueImpl;

/**
 * Registra gli encoded value custom del progetto (calcolati dalla pipeline
 * Python come tag fun:* nel PBF) e delega tutto il resto al registry standard.
 *
 * Serve SOLO in fase di import: al load da cache gli EV vengono deserializzati
 * dalle properties del grafo, quindi il server ufficiale li usa senza codice.
 */
public class FunImportRegistry implements ImportRegistry {
    public static final String FUN_CURVATURE = "fun_curvature"; // 0-100
    public static final String FUN_SIGNALS = "fun_signals";     // 0-15 (semafori+stop per km)

    private final DefaultImportRegistry fallback = new DefaultImportRegistry();

    @Override
    public ImportUnit createImportUnit(String name) {
        if (FUN_CURVATURE.equals(name))
            return ImportUnit.create(name,
                    props -> new IntEncodedValueImpl(FUN_CURVATURE, 7, false),
                    (lookup, props) -> new FunTagParser(
                            lookup.getIntEncodedValue(FUN_CURVATURE), "fun:curvature", 100));
        if (FUN_SIGNALS.equals(name))
            return ImportUnit.create(name,
                    props -> new IntEncodedValueImpl(FUN_SIGNALS, 4, false),
                    (lookup, props) -> new FunTagParser(
                            lookup.getIntEncodedValue(FUN_SIGNALS), "fun:signals", 15));
        return fallback.createImportUnit(name);
    }
}
