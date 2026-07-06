package com.bikemaps;

import com.graphhopper.reader.ReaderWay;
import com.graphhopper.routing.ev.EdgeIntAccess;
import com.graphhopper.routing.ev.IntEncodedValue;
import com.graphhopper.routing.util.parsers.TagParser;
import com.graphhopper.storage.IntsRef;

/**
 * Legge un tag numerico precalcolato dalla pipeline Python (es. fun:curvature)
 * e lo scrive nell'encoded value corrispondente. Tag assente o non numerico = 0.
 */
public class FunTagParser implements TagParser {
    private final IntEncodedValue enc;
    private final String tagKey;
    private final int maxValue;

    public FunTagParser(IntEncodedValue enc, String tagKey, int maxValue) {
        this.enc = enc;
        this.tagKey = tagKey;
        this.maxValue = maxValue;
    }

    @Override
    public void handleWayTags(int edgeId, EdgeIntAccess edgeIntAccess, ReaderWay way, IntsRef relationFlags) {
        String v = way.getTag(tagKey);
        if (v == null)
            return;
        try {
            int i = Integer.parseInt(v);
            enc.setInt(false, edgeId, edgeIntAccess, Math.max(0, Math.min(maxValue, i)));
        } catch (NumberFormatException e) {
            // tag corrotto: lascia il default 0
        }
    }
}
