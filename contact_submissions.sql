/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19  Distrib 10.11.13-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: localhost    Database: eice_payroll_test
-- ------------------------------------------------------
-- Server version	10.11.13-MariaDB-0ubuntu0.24.04.1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `contact_submissions`
--

DROP TABLE IF EXISTS `contact_submissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `contact_submissions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) DEFAULT NULL,
  `companyName` varchar(100) DEFAULT NULL,
  `role` varchar(100) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `phoneCode` varchar(10) DEFAULT NULL,
  `country` varchar(100) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `requirement` text DEFAULT NULL,
  `message` text DEFAULT NULL,
  `submitted_at` timestamp NULL DEFAULT current_timestamp(),
  `product` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=43 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `contact_submissions`
--

LOCK TABLES `contact_submissions` WRITE;
/*!40000 ALTER TABLE `contact_submissions` DISABLE KEYS */;
INSERT INTO `contact_submissions` VALUES
(1,'ewewew','wewewew','ewewe','ewwew@gfgf.gfgf','3456789087','91','sdsdsd','dsdsd','Product Details or Demo','dsdsd','2026-04-27 10:36:51',NULL),
(2,'Aishwarya Pratap Singh','eice technology','asfsef','aishwarypratapsingh09@gmail.com','8840171145','91','India','Noida','Product Pricing','fef3ef can I get free product','2026-04-27 10:38:08',NULL),
(3,'Aishwarya Pratap Singh','Eice technology','software engineer','aishwarypratapsingh09@gmail.com','8840171145','91','India','Noida','Product Pricing','Demo','2026-04-27 11:45:30',NULL),
(4,'Ankit Rawat','EICE','Sr.UIUX Designer','ankit.rawat@eicetechnology.com','9971495369','91','India','Secto 62- Platina Heights Noida','Product Pricing','I would like to know the pricing of Verilock product','2026-04-27 12:00:07',NULL),
(5,'Aishwarya Pratap Singh','eice technology','wersd','aishwarypratapsingh09@gmail.com','8840171145','91','India','Noida','Product Pricing','demo','2026-04-28 07:10:06',NULL),
(6,'Aishwarya Pratap Singh','eice technology','wdwewef','aishwarypratapsingh09@gmail.com','8746373838','91','India','Noida','Support or Training','wefwefvwevw','2026-04-28 07:19:19',NULL),
(7,'Ankit Rawat','EICE','Sr UIUX Designer','ankit.rawat09@gmail.com','9971495369','91','India','Noida 62','Product Pricing','I need to know pricing','2026-04-28 17:38:25',NULL),
(8,'Ankit Rawat','EICE','Senior UIUX Designer','ankit.rawat09@gmail.com','9971495369','91','India','Mahayana Gandhi Road','Product Pricing','I need to know the pricing','2026-05-19 18:18:06',NULL),
(9,'Aishwarya Pratap Singh','eice technology','software developer','aishwarypratapsingh09@gmail.com','8840171145','91','India','Noida','Product Pricing','uiuigugyuy','2026-05-20 06:35:26',NULL),
(10,'kjwegfyuwqe','mfvyuweqf','software','arggragar@gmail.com','8840171145','91','asa','dsvdsafa','Support or Training','testing','2026-05-20 06:52:15',NULL),
(11,'Ankit Rawat','EICE','dgdhgdg','ankit.rawat@eicetechnology.com','9971495369','91','India','Secto 62- Platina Heights Noida','Product Pricing','eeee','2026-05-20 09:51:10',NULL),
(12,'Aishwarya Pratap Singh','eice technology','dscwdc','aishwarypratapsingh09@gmail.com','8840171145','91','India','Noida','Product Pricing','regerfer','2026-05-20 10:13:35',NULL),
(13,'Aishwarya Pratap Singh','eice technology','freer','aishwarypratapsingh09@gmail.com','8840171145','91','India','Noida','Product Pricing','pricing','2026-05-21 04:56:28',NULL),
(14,'Aishwarya Pratap Singh','eice technology','dsvef','aishwarypratapsingh09@gmail.com','8840171145','91','India','Noida','Product Pricing','wefcewfcwef','2026-05-25 05:31:40',NULL),
(15,'Aishwarya Pratap Singh','eice technology','dskjbjkvsksd','aishwarypratapsingh09@gmail.com','8840171145','91','India','Noida','Product Pricing','sabdjkueiw','2026-05-28 10:58:16',NULL),
(16,'asdfghjk','sdfgh','wertyu','wertyui@gmail.com','0987654321','91','zxcv','gfdxdxdsxzsa','Product Details or Demo','asderftgyui','2026-06-10 11:19:14',NULL),
(17,'fghrth','herer','erje','test@gmail.com','8840171145','91','india','ufysgyucgwufw','Product Pricing','hfuewuf test8ng','2026-06-10 11:51:00',NULL),
(18,'aishwarya pratap singh','aaadadad','fafaf','test@gmail.com','8840171145','91','dsvceve','eveve','Product Pricing','testing','2026-06-10 12:02:09',NULL),
(19,'adadf','acafc','ccwc','cwcw@gmail.com','8840171145','91','cwvewve','efwf3f','Product Pricing','scevev','2026-06-10 12:03:06',NULL),
(20,'Ankit Rawat','EICE','aa','ankit.rawat@eicetechnology.com','9971495369','91','India','Noida platina heights','Product Details or Demo','Interested in product demo','2026-06-18 10:52:30',NULL),
(21,'Aishwarya Pratap Singh','eicetchnology','software engineer','aps9794312612@gmail.com','8840171145','91','India','FlAt no. 820, I-block','Product Pricing','demo testing','2026-07-08 04:34:20',NULL),
(22,'Aishwary Pratap singh','eicetchnology','software engineer','aishwarypratapsingh09@gmail.com','8840171145','91','India','platina heigjts','Product Details or Demo','demo testing','2026-07-08 06:27:06',NULL),
(23,'Aishwary Pratap singh','eicetechnology','software engineer','aishwarypratapsingh09@gmail.com','8840171145','91','India','platina heights','Support or Training','demo testing','2026-07-08 06:28:00',NULL),
(24,'Sahdev','Test','It','dsa@iicdelhi.in','8527843111','91','India','Test','Product Pricing','Testing call me if you get this message','2026-07-08 17:55:52',NULL),
(25,'Aishwary Pratap singh','sdu','kjds','aishwarypratapsingh09@gmail.com','7867896745','91','india','jhds','Product Pricing','test','2026-07-14 11:25:22',NULL),
(26,'Aishwary Pratap singh','dfwsf','cwe','aishwarypratapsingh09@gmail.com','6789676567','91','india','dshu','Product Pricing','jhsd','2026-07-14 11:26:47',NULL),
(27,'Aishwary Pratap singh','Eice Technology','Manger','aishwarypratapsingh09@gmail.com','8092952307','91','India','Gaur city','Product Details or Demo','Test Query','2026-07-14 11:29:40',NULL),
(28,'varun kumar','wejkjef','ejifewjk','varunkumar953685@gmail.com','9536855214','91','India','Kishan Sehkari Chini Mill','Product Pricing','esnjkfjwehe','2026-07-14 11:55:06',NULL),
(29,'njiuj','jkjk','jhjh','kjgyu@gmail.com','9536855214','91','India','Kishan Sehkari Chini Mill','Support or Training','bnhgctycdty','2026-07-14 12:00:20',NULL),
(30,'varun kumar','eice technology','software engineer','varun@eicetechnology.com','7876565478','91','India','sector 12, noida','Product Pricing','test','2026-07-16 09:12:00',NULL),
(31,'varun kumar','eice technology','manager','eicetechnologypvtltd@eicetechnology.com','8840171145','91','India','platina heights','Support or Training','test','2026-07-16 15:51:23','unknown'),
(32,'varun kumar','eice technology','manager','aishwarya.pratap.singh@eicetechnology.com','8840171145','91','India','platina heights','Product Pricing','test','2026-07-17 06:09:04','Verilock'),
(33,'varun kumar','eice technology','manager','aishwarypratapsingh09@eicetechnology.com','8840171145','91','India','platina heights','Support or Training','test','2026-07-17 06:36:55','EiceRise(Dining Pos)'),
(34,'aishwarya pratap singh','eice technology','manager','varun.kamar@eicetechnology.com','6787786787','91','India','platina height','Product Pricing','test','2026-07-17 07:12:16','Eice Voice'),
(35,'Aishwary Pratap singh','eice','Manager','aps@eice.com','8778779878','91','India','platina heights','Product Details or Demo','hey','2026-07-22 05:19:58','EiceRise Hospitality'),
(36,'Aishwary Pratap singh','eice','software','aishwarypratapsingh09@eice.com','9536855214','1','United States','delhi sabzi mandi','Product Pricing','testing','2026-07-23 06:58:47','EiceRise Hospitality'),
(37,'Aishwary Pratap singh','eice technology','Software engineer','aishwarya.pratap.singh@eicetechnology.com','8840171145','91','India','platina heights','Product Pricing','testing','2026-08-06 11:14:00','Enterprise App Development'),
(38,'Aishwary Pratap singh','eice technology','sofwtare engineer','aishwarypratapsingh09@eicetechnology.com','8840171145','91','India','platina heights','Product Details or Demo','testttiiing','2026-08-06 14:16:53','Blog'),
(39,'Almas Hossen','AB Bank PLC','','almas@abbl.com','9678555866','880','Bangladesh','Corporate Office, BCIC Bhaban, 30-31 Dilkusha C/A, Dhaka 1000, Bangladesh','Product Details or Demo','','2026-08-11 05:24:57','Infrasight'),
(40,'Rahul Singh','EICE Tech','Staff','anupamkrshukla@eicetech.com','8896619980','91','India','Noida 62','Product Details or Demo','Call me','2026-08-11 05:48:40','Infrasight'),
(41,'Ankit Rawat','EICE','Senior UIUX Designer','ankit.rawat09@gmail.com','9971495369','91','India','Noida , sector 62 platina heights','Support or Training','This is a test message.','2026-08-19 13:14:17','EiceRise Hospitality'),
(42,'Aishwary Pratap singh','eice','software','aishwarypratapsingh09@gmail.com','8840171145','91','India','platina heights','Product Pricing','demo','2026-08-21 06:09:06','Eice SmartFit');
/*!40000 ALTER TABLE `contact_submissions` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_ZERO_IN_DATE,NO_ZERO_DATE,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`remoteuser`@`%`*/ /*!50003 TRIGGER trg_contact_submissions_ins AFTER INSERT ON contact_submissions
            FOR EACH ROW
            INSERT INTO payroll_audit_log(TABLE_NAME, ACTION_TYPE, RECORD_ID, NEW_VALUES, CHANGED_BY)
            VALUES ('contact_submissions','INSERT', NEW.id,
            JSON_OBJECT('id', NEW.id,'name', NEW.name,'companyName', NEW.companyName,'role', NEW.role,'email', NEW.email,'phone', NEW.phone,'phoneCode', NEW.phoneCode,'country', NEW.country,'address', NEW.address,'requirement', NEW.requirement,'message', NEW.message,'submitted_at', NEW.submitted_at), COALESCE(@logged_user, 'SYSTEM')) */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_ZERO_IN_DATE,NO_ZERO_DATE,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`remoteuser`@`%`*/ /*!50003 TRIGGER trg_contact_submissions_upd AFTER UPDATE ON contact_submissions
            FOR EACH ROW
            INSERT INTO payroll_audit_log(TABLE_NAME, ACTION_TYPE, RECORD_ID, OLD_VALUES, NEW_VALUES, CHANGED_BY)
            VALUES ('contact_submissions','UPDATE', NEW.id,
            JSON_OBJECT('id', OLD.id,'name', OLD.name,'companyName', OLD.companyName,'role', OLD.role,'email', OLD.email,'phone', OLD.phone,'phoneCode', OLD.phoneCode,'country', OLD.country,'address', OLD.address,'requirement', OLD.requirement,'message', OLD.message,'submitted_at', OLD.submitted_at),
            JSON_OBJECT('id', NEW.id,'name', NEW.name,'companyName', NEW.companyName,'role', NEW.role,'email', NEW.email,'phone', NEW.phone,'phoneCode', NEW.phoneCode,'country', NEW.country,'address', NEW.address,'requirement', NEW.requirement,'message', NEW.message,'submitted_at', NEW.submitted_at),
            COALESCE(@logged_user, 'SYSTEM')) */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_ZERO_IN_DATE,NO_ZERO_DATE,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`remoteuser`@`%`*/ /*!50003 TRIGGER trg_contact_submissions_del AFTER DELETE ON contact_submissions
            FOR EACH ROW
            INSERT INTO payroll_audit_log(TABLE_NAME, ACTION_TYPE, RECORD_ID, OLD_VALUES, CHANGED_BY)
            VALUES ('contact_submissions','DELETE', OLD.id,
            JSON_OBJECT('id', OLD.id,'name', OLD.name,'companyName', OLD.companyName,'role', OLD.role,'email', OLD.email,'phone', OLD.phone,'phoneCode', OLD.phoneCode,'country', OLD.country,'address', OLD.address,'requirement', OLD.requirement,'message', OLD.message,'submitted_at', OLD.submitted_at),
            COALESCE(@logged_user, 'SYSTEM')) */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-21  7:06:08
