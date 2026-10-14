package shop.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.ResponseBody;

@Controller
@ResponseBody // violation: SpringRestController
public class LegacyController {}
