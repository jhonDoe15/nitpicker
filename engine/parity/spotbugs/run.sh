#!/bin/bash
# run.sh <classes dir> <out.xml> [aux class path] : SpotBugs with the FindSecBugs plugin, the way a nitpicker Java run starts it.
# SPOTBUGS_HOME holds an unpacked SpotBugs 4.9.8 with findsecbugs-plugin-1.14.0.jar in plugins/.
# The fixtures are compiled with: javac -g -parameters -d <classes dir> @sources.txt
set -e
exclude="$(dirname "$0")/../../../languages/java/gradle/security/exclude.xml"
java -Xmx4g -cp "$SPOTBUGS_HOME/lib/*" edu.umd.cs.findbugs.FindBugs2 -effort:default -medium -xml:withMessages \
  -pluginList "$SPOTBUGS_HOME/plugins/findsecbugs-plugin-1.14.0.jar" -exclude "$exclude" -output "$2" ${3:+-auxclasspath "$3"} "$1"
