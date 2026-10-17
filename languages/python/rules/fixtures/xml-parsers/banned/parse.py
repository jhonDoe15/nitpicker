import xml.dom.expatbuilder
import xml.dom.minidom
import xml.dom.pulldom
import xml.etree.ElementTree as ET
import xml.sax
import xml.sax.expatreader
from xml.etree.cElementTree import parse as parse_c


def read(text, path):
    parse_c(path)
    ET.fromstring(text)
    xml.sax.expatreader.create_parser()
    xml.dom.expatbuilder.parseString(text)
    xml.sax.parseString(text, None)
    xml.dom.minidom.parseString(text)
    xml.dom.pulldom.parseString(text)
